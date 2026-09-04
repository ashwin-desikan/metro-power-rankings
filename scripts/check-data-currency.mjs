#!/usr/bin/env node
/**
 * check:data-currency - what the site currently owes its slow-moving datasets.
 *
 * WHY THIS EXISTS. A scraper that breaks fails loudly: it throws, the job goes
 * red, somebody gets a notification. A championship that finished in November
 * and never got its row fails silently. The file still parses, the page still
 * renders, the board still ranks, and it answers a question about this year
 * with last year's facts. Nothing is broken enough to notice.
 *
 * On 2026-09-04 the Cup gained motorsport podiums, road cycling titles, the
 * women's ice hockey worlds and two women's rankings, all of them exactly that
 * shape: a handful of rows a year, arriving on known dates, with no scheduled
 * job behind them. The honest answer to "how do we keep these current" is not
 * a scraper for each one. It is knowing when each is due and saying so.
 *
 * WHAT IT CHECKS, from scripts/data/data-currency.json:
 *   annual    - an event with a season-end date. The newest year in the data
 *               must be the newest season that has actually finished, once the
 *               grace period is up.
 *   snapshots - a ranking with an asOf. It may not be older than maxAgeDays.
 *
 * The probes read the real data files rather than a mirrored list of years, so
 * this cannot drift from what the pipeline actually holds. A manifest entry
 * whose file or key has been renamed is itself reported, rather than passing
 * because it found nothing.
 *
 * SEVERITY. Warn-only by default and it exits 0, because a currency backlog is
 * a to-do list and should not block an unrelated frontend change. Pass --strict
 * to make anything overdue a hard failure; that is the mode to switch on once
 * the standing backlog is clear.
 *
 * Run: npm run check:data-currency  (or with --strict)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "data-currency.json");
const STRICT = process.argv.includes("--strict");
const TODAY = new Date(process.env.CURRENCY_TODAY || Date.now());

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const maxOr = (nums) => (nums.length ? Math.max(...nums) : null);

/** Newest year present for one motorsport series, across all three places. */
function probeMotorsport(key) {
  if (key === "formula-1") {
    // Champions live in the F1 pipeline; the rest of the podium is curated.
    // The season is only complete when both have it, so take the lower.
    const live = readJson("public/data/f1/data.json").champions || [];
    const doc = readJson("scripts/data/motorsport-series.json");
    const s = (doc.series || []).find((x) => x.key === key);
    if (!s) return { error: "series 'formula-1' not in motorsport-series.json" };
    const a = maxOr(live.map((r) => Number(r.season)).filter(Boolean));
    const b = maxOr((s.runners_up || []).map((r) => Number(r.year)).filter(Boolean));
    return a == null || b == null ? { error: "no seasons found" } : { year: Math.min(a, b) };
  }
  const doc = readJson("scripts/data/motorsport-series.json");
  const s = (doc.series || []).find((x) => x.key === key);
  if (!s) return { error: `series '${key}' not in motorsport-series.json` };
  const years = ["champions", "runners_up", "thirds"]
    .flatMap((k) => (s[k] || []).map((r) => Number(r.year)))
    .filter(Boolean);
  const y = maxOr(years);
  return y == null ? { error: `series '${key}' has no results` } : { year: y };
}

function probeCycling(listKey) {
  const doc = readJson("scripts/data/road-cycling.json");
  const list = doc[listKey];
  if (!Array.isArray(list)) return { error: `road-cycling.json has no list '${listKey}'` };
  const y = maxOr(list.map((r) => Number(r[0])).filter(Boolean));
  return y == null ? { error: `list '${listKey}' is empty` } : { year: y };
}

function probeTourDeFrance() {
  const rows = readJson("public/data/champions-history.json");
  const years = rows
    .filter((r) => r.sport === "Cycling" && r.competition === "Tour de France")
    .map((r) => Number(r.year))
    .filter(Boolean);
  const y = maxOr(years);
  return y == null ? { error: "no Tour de France rows in champions-history.json" } : { year: y };
}

function probeWomensHockeyWorlds() {
  const rows = readJson("public/data/hockey/womens-nations.json");
  const years = rows.flatMap((r) =>
    ["worlds_gold_years", "worlds_silver_years", "worlds_bronze_years"].flatMap(
      (k) => (r[k] || []).map(Number)
    )
  );
  const y = maxOr(years.filter(Boolean));
  return y == null ? { error: "womens-nations.json has no medal years" } : { year: y };
}

function runProbe(probe) {
  try {
    if (probe.startsWith("motorsport:")) return probeMotorsport(probe.slice(11));
    if (probe.startsWith("cycling:")) return probeCycling(probe.slice(8));
    if (probe === "tourDeFrance") return probeTourDeFrance();
    if (probe === "womensHockeyWorlds") return probeWomensHockeyWorlds();
    return { error: `unknown probe '${probe}'` };
  } catch (e) {
    return { error: `probe '${probe}' failed: ${e.message}` };
  }
}

/**
 * The newest season that has finished AND cleared its grace period. Walk back
 * from this year rather than assuming, so a January run does not demand a row
 * for a season that ends in December.
 */
function dueYear({ endsMonthDay, graceDays }) {
  const [m, d] = endsMonthDay.split("-").map(Number);
  for (let y = TODAY.getUTCFullYear(); y > TODAY.getUTCFullYear() - 3; y--) {
    const due = new Date(Date.UTC(y, m - 1, d));
    due.setUTCDate(due.getUTCDate() + graceDays);
    if (due <= TODAY) return y;
  }
  return null;
}

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
const late = [];
const broken = [];
const ok = [];

for (const e of man.annual) {
  const res = runProbe(e.probe);
  if (res.error) { broken.push({ ...e, why: res.error }); continue; }
  const want = dueYear(e);
  if (want == null) { ok.push({ ...e, have: res.year, note: "nothing due yet" }); continue; }
  if (res.year >= want) ok.push({ ...e, have: res.year });
  else late.push({ ...e, have: res.year, want, missing: want - res.year });
}

for (const e of man.snapshots) {
  if (!existsSync(join(ROOT, e.file))) { broken.push({ ...e, why: `missing file ${e.file}` }); continue; }
  let meta;
  try { meta = (readJson(e.file)._meta) || {}; }
  catch (err) { broken.push({ ...e, why: `unreadable: ${err.message}` }); continue; }
  const raw = meta.asOf || meta.asof;
  if (!raw) { broken.push({ ...e, why: "no _meta.asOf" }); continue; }
  // "2026-06" is a legal as-of; read it as the first of that month.
  const asOf = new Date(`${raw.length === 7 ? `${raw}-01` : raw}T00:00:00Z`);
  if (Number.isNaN(asOf.getTime())) { broken.push({ ...e, why: `unparseable asOf '${raw}'` }); continue; }
  const age = Math.floor((TODAY - asOf) / 86400000);
  if (age > e.maxAgeDays) late.push({ ...e, asOf: raw, age, over: age - e.maxAgeDays });
  else ok.push({ ...e, asOf: raw, age });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`check:data-currency  (as of ${TODAY.toISOString().slice(0, 10)})`);
console.log(`  current: ${ok.length}   overdue: ${late.length}   unreadable: ${broken.length}`);

if (late.length) {
  console.log("\n  OVERDUE");
  for (const e of late) {
    if (e.want != null) {
      console.log(`    ${pad(e.label, 38)} has ${e.have}, owes ${e.want}` +
        (e.missing > 1 ? `  (${e.missing} seasons behind)` : ""));
    } else {
      console.log(`    ${pad(e.label, 38)} as of ${e.asOf}, ${e.age} days old, ${e.over} over the limit`);
    }
  }
}
if (broken.length) {
  console.log("\n  CANNOT CHECK  (a manifest entry no longer matches the data)");
  for (const e of broken) console.log(`    ${pad(e.label, 38)} ${e.why}`);
}
if (!late.length && !broken.length) console.log("\n  Everything current.");

const bad = late.length + broken.length;
if (bad && STRICT) {
  console.error(`\ncheck:data-currency FAILED (--strict): ${bad} item(s) need attention.`);
  process.exit(1);
}
if (bad) console.log("\n  Warn-only. Pass --strict to make this a hard failure.");
process.exit(0);
