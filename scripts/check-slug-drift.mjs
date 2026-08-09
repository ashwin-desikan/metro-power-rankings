#!/usr/bin/env node
/**
 * Slug-drift guard.
 *
 * Metro slugs are derived from the workbook name at extract.py:147 and stored
 * nowhere. Collisions are then resolved at extract.py:1493 IN RANK ORDER: the
 * higher-ranked metro keeps the bare slug and the loser gets a country suffix
 * (that is where cordoba-mexico, leon-mexico, macon-france, merida-spain and
 * beja-portugal come from). Both facts together mean a slug — and therefore a
 * live, indexed URL — can move with no code change at all: rename a metro in
 * the workbook, or let two metros swap rank, and the URL follows silently.
 *
 * This guard makes that impossible to ship by accident. Any slug present in
 * the baseline and absent from the current build must have a redirect in
 * lib/metroRedirects.json pointing at a slug that actually exists.
 *
 * Updating the baseline is a deliberate act, done in the same commit as the
 * redirects that cover the move. Refresh it with:
 *   node scripts/check-slug-drift.mjs --write-baseline
 *
 * Exit 0 on success (warnings allowed), exit 1 on any hard failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const METROS_JSON = path.join(ROOT, 'public/data/metros.json');
const BASELINE = path.join(ROOT, 'scripts/slug-baseline.json');
const REDIRECTS = path.join(ROOT, 'lib/metroRedirects.json');

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };
const warn = (msg) => { warnings++; console.warn(`WARN: ${msg}`); };
const ok = (msg) => console.log(`OK:   ${msg}`);

const readJson = (p, label) => {
  if (!fs.existsSync(p)) { fail(`${label} missing at ${path.relative(ROOT, p)}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`${label} does not parse: ${e.message}`); return null; }
};

const metros = readJson(METROS_JSON, 'metros.json');
if (!metros) process.exit(1);
const rows = Array.isArray(metros) ? metros : metros.metros;
const current = new Set(rows.map((m) => m.slug).filter(Boolean));
if (current.size < 1000) fail(`only ${current.size} slugs in metros.json — refusing to judge drift against a truncated build`);

// --write-baseline regenerates the ratchet from the current build. Deliberate,
// and belongs in the same commit as the redirects covering whatever moved.
if (process.argv.includes('--write-baseline')) {
  const payload = { note: 'Ratchet for scripts/check-slug-drift.mjs. Regenerate only alongside the redirects that cover a slug move.', count: current.size, slugs: [...current].sort() };
  fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, BASELINE)} (${current.size} slugs)`);
  process.exit(0);
}

const baseline = readJson(BASELINE, 'slug baseline');
const redirectsFile = readJson(REDIRECTS, 'metro redirect map');
if (!baseline || !redirectsFile) process.exit(1);

const baseSlugs = new Set(baseline.slugs || []);
const map = redirectsFile.metros || {};

// 1. Every slug that left the build must be redirected somewhere real.
const removed = [...baseSlugs].filter((s) => !current.has(s)).sort();
const unredirected = removed.filter((s) => !map[s]);
const deadDestination = removed.filter((s) => map[s] && !current.has(map[s]));

if (unredirected.length) {
  fail(`${unredirected.length} slug(s) disappeared with no redirect. Every one of these is a live indexed URL that would start 404ing:`);
  for (const s of unredirected.slice(0, 25)) console.error(`        /rankings/${s}`);
  if (unredirected.length > 25) console.error(`        ...and ${unredirected.length - 25} more`);
  console.error('      Add them to lib/metroRedirects.json, then refresh the baseline with --write-baseline in the same commit.');
} else if (removed.length) {
  ok(`${removed.length} slug(s) moved, all redirected`);
} else {
  ok(`no slug left the build (${baseSlugs.size} in baseline)`);
}

for (const s of deadDestination) fail(`redirect ${s} -> ${map[s]} points at a slug that does not exist`);

// 2. A redirect must never shadow a page that still exists, and must never
//    point at itself. Both would be silently self-inflicted 308 loops.
for (const [from, to] of Object.entries(map)) {
  if (from === to) fail(`redirect ${from} -> ${to} is a self-loop`);
  if (current.has(from)) fail(`redirect source ${from} is still a live metro slug — it would shadow a real page`);
  if (map[to]) fail(`redirect chain: ${from} -> ${to} -> ${map[to]}; point ${from} at the final destination instead`);
}

// 3. New slugs are normal (the workbook gains metros) but worth surfacing, so
//    a rename never hides inside a batch of additions unnoticed.
const added = [...current].filter((s) => !baseSlugs.has(s)).sort();
if (added.length) warn(`${added.length} new slug(s) since the baseline: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ', ...' : ''}`);

// 4. Competition slugs under /sports/champions/[comp] have their own map and
//    their own history of accent damage. Validate destinations exist.
const compMap = redirectsFile.competitions || {};
const compCount = Object.keys(compMap).length;
if (compCount) {
  // A competition lives in EITHER the honour-roll history or the club extras,
  // never reliably both: the domestic-league lineages (Úrvalsdeild, Andorra,
  // Uruguay) only reach the site through champions-metro-extra.json.
  const sources = ['public/data/champions-history.json', 'public/data/champions-metro-extra.json']
    .map((rel) => path.join(ROOT, rel))
    .filter((p) => fs.existsSync(p));
  if (sources.length) {
    const blob = sources.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
    const missing = Object.values(compMap).filter((to) => !blob.includes(`"${to}"`));
    if (missing.length) fail(`competition redirect destination(s) absent from the champions data: ${missing.join(', ')}`);
    else ok(`${compCount} competition redirect(s), all destinations present`);
  }
}

console.log(`check-slug-drift ${failures ? 'FAILED' : 'OK'} (${failures} failure(s), ${warnings} warning(s))`);
process.exit(failures ? 1 : 0);
