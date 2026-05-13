import "server-only";
// Substack RSS loader for the Featured Articles strip on /.
//
// Strategy:
//   1. Try the live RSS feed at build time. Next.js caches the response and
//      revalidates hourly so new posts appear without a code change.
//   2. If the live fetch fails (network blocked, Substack 5xx, malformed XML),
//      fall back to the committed snapshot at public/data/substack-feed.json.
//   3. The snapshot is also the source of truth in local dev environments
//      where Substack is not reachable (e.g., the Cowork sandbox allowlist).
//
// The strip on / is rendered by combining a small PINNED_FEATURED list of
// internal evergreen pages with the most-recent N Substack items returned
// by this loader. Pinned items always render first.

import { readFileSync } from "fs";
import { join } from "path";

export type SubstackPost = {
  title: string;
  url: string;
  /** ISO yyyy-mm-dd, derived from the feed's <pubDate>. */
  pubDate: string;
  /** Plain-text subtitle/excerpt, HTML stripped, trimmed to ~220 chars. */
  description: string;
  /** Stable slug parsed from the post URL, useful for dedupe + keys. */
  slug: string;
};

const FEED_URL = "https://citizenofnowhere.substack.com/feed";
const SNAPSHOT_PATH = ["public", "data", "substack-feed.json"] as const;

// Keep the snapshot fresh on each Vercel build but don't hammer Substack at
// request time. One hour is plenty for an editorial site.
const REVALIDATE_SECONDS = 3600;

/**
 * Fetch and normalize the Substack feed. Always resolves; on failure returns
 * the committed snapshot. Never throws — the home page must render.
 */
export async function getSubstackPosts(limit = 10): Promise<SubstackPost[]> {
  let live: SubstackPost[] = [];
  try {
    const res = await fetch(FEED_URL, {
      // ISR-style revalidate. Works in Next.js server components.
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        // Some hosts 403 default UAs.
        "User-Agent": "CitizenOfNowhereBot/1.0 (+https://rankings.citizenofnowhere.org)",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (res.ok) {
      const xml = await res.text();
      live = parseSubstackRss(xml);
    }
  } catch {
    // swallow — fall through to snapshot
  }

  if (live.length > 0) return live.slice(0, limit);
  return loadSnapshot().slice(0, limit);
}

function loadSnapshot(): SubstackPost[] {
  try {
    const raw = readFileSync(join(process.cwd(), ...SNAPSHOT_PATH), "utf-8");
    const parsed = JSON.parse(raw) as { posts?: SubstackPost[] };
    return Array.isArray(parsed.posts) ? parsed.posts : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lightweight RSS parser.
//
// Substack's feed shape is stable and small: <rss><channel><item>...</item></channel></rss>.
// We only need title, link, pubDate, and description, all of which are wrapped
// in CDATA or are simple element text. A regex pass keeps us free of an extra
// dependency for one consumer. If Substack ever ships a breaking change we can
// swap in fast-xml-parser without changing call sites.
// ---------------------------------------------------------------------------

function parseSubstackRss(xml: string): SubstackPost[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const posts: SubstackPost[] = [];
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

function extractCdata(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`);
  const m = block.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function extractText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  return (m?.[1] ?? "").trim();
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");
}

function toIsoDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function slugFromUrl(url: string): string {
  const m = url.match(/\/p\/([^/?#]+)/);
  return m?.[1] ?? url;
}
