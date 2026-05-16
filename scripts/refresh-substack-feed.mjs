// Refresh public/data/substack-feed.json from the live RSS feed.
//
// Why this exists
//   public/data/substack-feed.json is a build-time fallback for the home page
//   Featured Articles strip when the live fetch fails (Cowork sandbox blocked,
//   Substack 5xx, etc.). It is committed to git so the snapshot survives any
//   build environment. lib/substack.ts always prefers the live fetch and only
//   reads the snapshot when fetch fails.
//
// When to run
//   - After publishing a new Substack post and you want the snapshot to
//     reflect it for environments without live fetch.
//   - As a defensive refresh before a release if you have not touched the
//     snapshot in weeks.
//   - Daily via the GH Action workflow (out-of-band — that workflow currently
//     triggers Vercel deploy only; if you want this in CI, wire it in).
//
// Usage
//   node scripts/refresh-substack-feed.mjs
//   node scripts/refresh-substack-feed.mjs --dry-run     # show diff, write nothing

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FEED_URL = "https://citizenofnowhere.substack.com/feed";
const SNAPSHOT_PATH = join(process.cwd(), "public", "data", "substack-feed.json");
const DRY_RUN = process.argv.includes("--dry-run");

function extractCdata(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`);
  const m = block.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function extractText(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  return (m?.[1] ?? "").trim();
}

function stripHtml(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“").replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—");
}

function toIsoDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function slugFromUrl(url) {
  const m = url.match(/\/p\/([^/?#]+)/);
  return m?.[1] ?? url;
}

function parseRss(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const posts = [];
  for (const block of items) {
    const title = extractCdata(block, "title");
    const url = extractText(block, "link");
    const pubDateRaw = extractText(block, "pubDate");
    const descriptionRaw = extractCdata(block, "description");
    if (!title || !url) continue;
    posts.push({
      title: decodeEntities(title).trim(),
      url: url.trim(),
      pubDate: toIsoDate(pubDateRaw),
      description: stripHtml(descriptionRaw).slice(0, 220).trim(),
      slug: slugFromUrl(url),
    });
  }
  return posts;
}

// Substack (via Cloudflare) 403s GitHub Actions runner IPs when the
// request UA looks bot-ish. lib/substack.ts uses a bot-styled UA and works
// fine from Vercel build runners (different IP ranges, not flagged), but
// this script runs from GitHub Actions so we present a browser UA. We are
// not pretending to be a person browsing — this is the published public RSS
// feed and the runner hits it once a day. The UA is a workaround for
// Cloudflare's default bot challenge, nothing more.
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0";

async function main() {
  console.log(`Fetching ${FEED_URL} ...`);
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const xml = await res.text();
  const posts = parseRss(xml);
  if (posts.length === 0) {
    console.error("Parsed 0 posts. Refusing to overwrite snapshot.");
    process.exit(2);
  }

  // Preserve the lead comment.
  let prior = {};
  try { prior = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")); } catch {}
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const next = {
    _comment: prior._comment ?? "Cached fallback snapshot for lib/substack.ts.",
    fetchedAt,
    posts,
  };

  const before = JSON.stringify(prior?.posts ?? [], null, 2);
  const after = JSON.stringify(posts, null, 2);
  const priorSlugs = new Set((prior?.posts ?? []).map(p => p.slug));
  const newSlugs = posts.map(p => p.slug).filter(s => !priorSlugs.has(s));

  console.log(`Live posts: ${posts.length}`);
  console.log(`New slugs since last snapshot (${prior?.fetchedAt ?? "never"}): ${newSlugs.length ? newSlugs.join(", ") : "none"}`);

  if (DRY_RUN) {
    console.log("Dry run, not writing.");
    return;
  }
  if (before === after && prior.fetchedAt === fetchedAt) {
    console.log("No change, snapshot already current.");
    return;
  }
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`Wrote ${SNAPSHOT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
