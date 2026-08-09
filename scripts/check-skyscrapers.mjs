#!/usr/bin/env node
/**
 * Guard: the SKYDB skyscraper pull has not collapsed or drifted.
 *
 * public/data/skyscrapers.json replaced the hand-curated Skyscrapers sheet as
 * the source of the 150m+/200m+/300m+ counts. That sheet did not become
 * useless when it stopped being the source - it became the regression test.
 * Two independent people counted the same buildings; when they disagree
 * violently on a specific metro, one of them is wrong and someone should look.
 *
 * What this catches that a schema check would not:
 *
 *   1. THE FILE GOING MISSING. extract.py falls back to the workbook sheet if
 *      skyscrapers.json is absent. That fallback exists so a fresh clone can
 *      still build, but shipping it would silently revert the data to the
 *      stale source, so the build fails here instead.
 *   2. A COLLAPSED PULL. If SKYDB is throttled or the API shape changes, the
 *      pull can succeed and return far too little. Absolute floors catch it.
 *   3. PER-METRO NONSENSE. A boundary edit or a bad coordinate batch can move
 *      hundreds of buildings between metros without changing the global total
 *      at all. Only a per-metro comparison sees that.
 *
 * The per-metro test is ratcheted against a baseline of the divergences that
 * exist today and are understood (Guangzhou absorbing Shenzhen, Seoul's
 * residential towers, the Malaysia gap). New ones fail; known ones do not.
 * Baseline: scripts/skyscraper-baseline.json.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "public", "data", "skyscrapers.json");
const BASELINE = path.join(ROOT, "scripts", "skyscraper-baseline.json");

// Absolute floors. Set well under today's numbers so ordinary monthly movement
// never trips them; they exist to catch a collapse, not to police growth.
const MIN_METROS = 300;
const MIN_150 = 8000;
const MIN_200 = 2400;
const MIN_300 = 240;
// A metro may differ from the sheet by this much before it needs a baseline
// entry. Below it, the two sources are just counting slightly differently.
const ABS_TOLERANCE = 25;
const REL_TOLERANCE = 0.5;

const fail = [];

if (!fs.existsSync(FILE)) {
  console.error(
    "check:skyscrapers FAIL\n" +
      "  public/data/skyscrapers.json is missing.\n" +
      "  extract.py would silently fall back to the stale workbook sheet.\n" +
      "  Run: python scripts/build-skyscrapers.py",
  );
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(FILE, "utf8"));
const metros = payload.metros ?? {};
const t = payload.totals ?? {};

if (!payload.generated) fail.push("no `generated` timestamp in skyscrapers.json");
if (Object.keys(metros).length < MIN_METROS)
  fail.push(
    `only ${Object.keys(metros).length} metros carry a count, expected at least ${MIN_METROS}`,
  );
for (const [key, min] of [
  ["over150m", MIN_150],
  ["over200m", MIN_200],
  ["over300m", MIN_300],
]) {
  if ((t[key] ?? 0) < min)
    fail.push(`${key} total is ${t[key] ?? 0}, expected at least ${min} (collapsed pull?)`);
}

// A metro cannot hold more 300m+ buildings than 200m+, or more 200m+ than
// 150m+. Cheap, and it catches a tier mix-up instantly.
for (const [slug, v] of Object.entries(metros)) {
  if (v.over300m > v.over200m || v.over200m > v.over150m)
    fail.push(
      `${slug}: tiers are not nested (150m+ ${v.over150m}, 200m+ ${v.over200m}, 300m+ ${v.over300m})`,
    );
}

// Per-metro divergence against the curated sheet.
if (fs.existsSync(BASELINE)) {
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const known = new Set(base.allowed ?? []);
  const sheet = base.sheet ?? {};
  const fresh = [];
  for (const [slug, sheetCount] of Object.entries(sheet)) {
    const got = metros[slug]?.over150m ?? 0;
    const diff = Math.abs(got - sheetCount);
    if (diff <= ABS_TOLERANCE) continue;
    if (diff / Math.max(sheetCount, 1) <= REL_TOLERANCE) continue;
    if (known.has(slug)) continue;
    fresh.push(`${slug}: sheet ${sheetCount}, skydb ${got} (differs by ${diff})`);
  }
  if (fresh.length) {
    fail.push(
      `${fresh.length} metro(s) newly diverge from the curated sheet beyond tolerance:\n    ` +
        fresh.slice(0, 15).join("\n    ") +
        "\n    If these are correct, add the slugs to scripts/skyscraper-baseline.json.",
    );
  }
} else {
  fail.push(`baseline missing at ${path.relative(ROOT, BASELINE)}`);
}

if (fail.length) {
  console.error("check:skyscrapers FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}

console.log(
  `check:skyscrapers OK  ${Object.keys(metros).length} metros, ` +
    `${t.over150m} at 150m+, ${t.over200m} at 200m+, ${t.over300m} at 300m+ ` +
    `(generated ${payload.generated})`,
);
