#!/usr/bin/env node
/**
 * Public-data sanity check.
 *
 * Verifies that the static data files our client-side hooks fetch actually
 * exist on disk at the URLs the hooks ask for. Wired into `npm run verify`
 * so any drift between hook URLs, the boundary build output, and metros.json
 * gets caught before push.
 *
 * Catches the two latent failure modes that bit us on 2026-05-24:
 *   1. Builder wrote boundaries-simplified.json into OUT_DIR instead of
 *      OUT_DIR.parent, so useCombinedBoundaries 404'd against the live URL
 *      even after a fresh rebuild and clean deploy.
 *   2. Newly-keyed countries in the boundary builder produced zero polygons,
 *      only discovered after deploy when readers reported missing shapes.
 *
 * Exit 0 on success (warnings allowed), exit 1 on any hard failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMBINED = path.join(ROOT, 'public/data/boundaries-simplified.json');
const METRO_DIR = path.join(ROOT, 'public/data/metro-boundaries');
const METROS_JSON = path.join(ROOT, 'public/data/metros.json');

// Floors are sized to current corpus minus reasonable churn. Raise as the
// dataset grows; do not raise so close to current count that ordinary
// editorial deletions trip the check.
const MIN_COMBINED_FEATURES = 1000;
const MIN_PER_METRO_FILES = 1000;

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };
const warn = (msg) => { warnings++; console.warn(`WARN: ${msg}`); };
const ok = (msg) => console.log(`OK:   ${msg}`);

// 1. boundaries-simplified.json: exists, parses, substantial, slug-tagged.
//    useCombinedBoundaries fetches /data/boundaries-simplified.json. If this
//    file is missing or malformed, the Expandable Map and the home rankings
//    overlay both render pins only with no polygon shapes.
let combined = null;
if (!fs.existsSync(COMBINED)) {
  fail(
    `boundaries-simplified.json missing at ${path.relative(ROOT, COMBINED)}. ` +
    `useCombinedBoundaries fetches /data/boundaries-simplified.json so this WILL 404 in production. ` +
    `Run scripts/build-metro-boundaries.py to emit it; the consumer expects it at public/data/, not public/data/metro-boundaries/.`,
  );
} else {
  try {
    combined = JSON.parse(fs.readFileSync(COMBINED, 'utf-8'));
  } catch (e) {
    fail(`boundaries-simplified.json did not parse as JSON: ${e.message}`);
  }
  if (combined) {
    if (combined.type !== 'FeatureCollection') {
      fail(`boundaries-simplified.json top-level type is "${combined.type}", expected "FeatureCollection".`);
    }
    if (!Array.isArray(combined.features)) {
      fail(`boundaries-simplified.json has no features array.`);
    } else if (combined.features.length < MIN_COMBINED_FEATURES) {
      fail(`boundaries-simplified.json has only ${combined.features.length} features; expected at least ${MIN_COMBINED_FEATURES}.`);
    } else {
      const sizeMB = (fs.statSync(COMBINED).size / 1024 / 1024).toFixed(1);
      ok(`boundaries-simplified.json: ${combined.features.length.toLocaleString()} features, ${sizeMB} MB raw`);
    }
    const noSlug = (combined.features || []).filter(f => !f?.properties?.slug);
    if (noSlug.length) {
      fail(`${noSlug.length} feature(s) in boundaries-simplified.json have no properties.slug; useCombinedBoundaries filters by slug so these will never render.`);
    }
  }
}

// 2. Per-metro directory: exists, substantial. Detail pages still use
//    useMetroBoundaries (per-slug) so the dir has to be populated even
//    after the home overlay switched to the combined file.
if (!fs.existsSync(METRO_DIR)) {
  fail(`metro-boundaries/ missing at ${path.relative(ROOT, METRO_DIR)}. Detail pages call useMetroBoundaries which fetches /data/metro-boundaries/<slug>.geojson.`);
} else {
  const files = fs.readdirSync(METRO_DIR).filter(f => f.endsWith('.geojson'));
  if (files.length < MIN_PER_METRO_FILES) {
    fail(`metro-boundaries/ has only ${files.length} .geojson files; expected at least ${MIN_PER_METRO_FILES}.`);
  } else {
    ok(`metro-boundaries/: ${files.length.toLocaleString()} per-slug .geojson files`);
  }
}

// 3. Coverage cross-check: every slug in metros.json should appear in the
//    combined file. Misses surface as warnings, not failures, because the
//    expected coverage gap (newly-wired countries pending Overture polygons)
//    is editorial state the user accepts. The warning catches the case where
//    a country was wired in but produced zero polygons, which is otherwise
//    invisible until a reader reports a missing shape.
if (combined && fs.existsSync(METROS_JSON)) {
  const metros = JSON.parse(fs.readFileSync(METROS_JSON, 'utf-8'));
  const combinedSlugs = new Set((combined.features || []).map(f => f?.properties?.slug).filter(Boolean));
  const metroSlugs = metros.map(m => m.slug).filter(Boolean);
  const missing = metroSlugs.filter(s => !combinedSlugs.has(s));
  const coverage = metroSlugs.length > 0
    ? ((metroSlugs.length - missing.length) / metroSlugs.length * 100).toFixed(1)
    : '0.0';
  if (missing.length === 0) {
    ok(`every metros.json slug has a polygon in boundaries-simplified.json`);
  } else {
    warn(`${missing.length} of ${metroSlugs.length} metros.json slug(s) have NO polygon in boundaries-simplified.json (${coverage}% covered):`);
    for (const s of missing.slice(0, 20)) console.warn(`        - ${s}`);
    if (missing.length > 20) console.warn(`        ... and ${missing.length - 20} more`);
  }
}

console.log();
if (failures > 0) {
  console.error(`check-public-data FAILED (${failures} failure(s), ${warnings} warning(s))`);
  process.exit(1);
}
console.log(`check-public-data OK (${warnings} warning(s))`);
