/**
 * check:cache-tags - a cache tag and its allowlist entry are two halves of one thing.
 *
 * THE BUG (found 2026-09-19): lib/nbaElo.ts tagged every season shard "nba-elo"
 * and read them from GitHub raw on a 24h ISR, which is what makes a data refresh
 * free of a build. But "nba-elo" was never added to ALLOWED_TAGS in
 * app/api/revalidate/route.ts, so the flush answered {"ok":false,"error":"unknown
 * tag"} and every NBA correction quietly waited out the full day. Nothing failed.
 * The same scan then found SEVEN more data tags in the same state.
 *
 * THE RULE: every tag a lib puts on a fetch must either be in ALLOWED_TAGS, or be
 * named in UPSTREAM_ONLY below with the reason nobody needs to flush it.
 *
 * Reads source text only, so it runs with no build and no network.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = join(ROOT, "app", "api", "revalidate", "route.ts");

/**
 * Tags on fetches of a THIRD PARTY's API, cached for a few minutes to spare the
 * upstream. No job of ours writes that data, so there is never a moment when we
 * know it changed and want it flushed; the short revalidate window is the design.
 */
const UPSTREAM_ONLY = {
  "espn-cfb-standings": "ESPN standings, short ISR window",
  "espn-scores": "ESPN scoreboard, short ISR window",
  "espn-mlb-fixtures": "ESPN scoreboard by day, short ISR window",
  "espn-tennis": "ESPN tennis draw, short ISR window",
  "spaia-npb-fixtures": "SPAIA game schedule, today only, short ISR window",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function allowedTags(routeSrc) {
  const m = routeSrc.match(/ALLOWED_TAGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) return null;
  // Strip line comments first: the allowlist documents each tag beside it, and a
  // quoted word inside a comment is not an allowed tag.
  const body = m[1].replace(/\/\/.*$/gm, "");
  return new Set([...body.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

export function tagsIn(src) {
  const found = [];
  for (const m of src.matchAll(/\btags:\s*\[([^\]]*)\]/g)) {
    for (const t of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) found.push(t[1]);
  }
  return found;
}

function main() {
  const allowed = allowedTags(readFileSync(ROUTE, "utf8"));
  if (!allowed) {
    console.error("check:cache-tags - FAIL: could not read ALLOWED_TAGS from app/api/revalidate/route.ts");
    process.exit(1);
  }
  const uses = new Map(); // tag -> [files]
  const files = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))];
  for (const f of files) {
    if (f === ROUTE) continue;
    const src = readFileSync(f, "utf8");
    if (!src.includes("tags:")) continue;
    // Only fetch/unstable_cache tags matter. A file with no `next:` or
    // `unstable_cache` uses "tags" for something else (digest topics, banter).
    if (!/next:\s*\{|unstable_cache/.test(src)) continue;
    for (const t of tagsIn(src)) {
      if (!uses.has(t)) uses.set(t, []);
      uses.get(t).push(relative(ROOT, f).replace(/\\/g, "/"));
    }
  }

  const missing = [...uses.keys()].filter((t) => !allowed.has(t) && !(t in UPSTREAM_ONLY)).sort();
  const staleExempt = Object.keys(UPSTREAM_ONLY).filter((t) => !uses.has(t));
  const unusedAllowed = [...allowed].filter((t) => !uses.has(t)).sort();

  if (missing.length || staleExempt.length) {
    console.error("check:cache-tags - FAIL");
    for (const t of missing) {
      console.error(`  "${t}" is tagged in ${uses.get(t).join(", ")} but is not in ALLOWED_TAGS.`);
      console.error(`     /api/revalidate answers "unknown tag", so this data can never be flushed.`);
      console.error(`     Add it to ALLOWED_TAGS, or to UPSTREAM_ONLY here with the reason.`);
    }
    for (const t of staleExempt) console.error(`  UPSTREAM_ONLY names "${t}" but nothing uses it any more: remove the entry.`);
    process.exit(1);
  }
  if (unusedAllowed.length) {
    console.log(`check:cache-tags - note: allowed but not found on any fetch: ${unusedAllowed.join(", ")}`);
  }
  console.log(`check:cache-tags - OK (${uses.size} tags on ${files.length} files scanned, ${allowed.size} flushable, ${Object.keys(UPSTREAM_ONLY).length} upstream-only)`);
}

main();
