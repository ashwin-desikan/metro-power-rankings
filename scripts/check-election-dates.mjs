#!/usr/bin/env node
/**
 * Static guard: no election hub may advertise a next-election date that has
 * already passed.
 *
 * lib/electionHubsMeta.ts is the single source of election dates for the whole
 * site: the landing countdown, every hub header, and (through
 * scripts/forecast/hub_dates.py) the forecast pipeline. A date that has quietly
 * gone by is the same failure the champions ledger hit with next-title dates,
 * and the same rule applies here: FLAG it, never auto-roll it. Somebody has to
 * file the result, move `last` forward and set the new `next`.
 *
 * Severity is deliberately graded, because a hard failure the morning after an
 * election would block every unrelated frontend change:
 *
 *   passed, within the grace period  -> warning, exit 0
 *   passed, beyond the grace period  -> error, exit 1
 *   confirmed with no date           -> error (the flag claims precision)
 *   unscheduled with a date          -> error (contradiction)
 *   no confidence at all             -> warning (defaults to "expected")
 *
 * SECOND PASS, added 2026-09-22: every RESULT record in
 * public/data/<code>-elections.json states its date twice, in prose and in a
 * `year` field, and that second statement is the only outside check on the
 * first. Eight records disagreed: six Greek rows read "August 29, 2026" or
 * "21 November 2017", India 1957 read "1951-52", UK 1832 read "22 November
 * 1830". Those are citation dates that leaked in where the infobox date is
 * wrapped in {{OldStyleDate}} or {{Gregorian to Julian}} and the scraper's
 * loose fallback could not read it. Left alone, five Greek elections from the
 * 1870s to 1915 would have published on /elections as THIS YEAR'S results.
 *
 * A date ending the year AFTER `year` is not a fault: elections do open in one
 * year and close in the next (India 1951-52, the first US presidential
 * election, the UK's own 1832 poll, which ran into January 1833).
 *
 * Run as `npm run check:election-dates` or `npm run verify`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const META = join(ROOT, "lib", "electionHubsMeta.ts");

// A fortnight: long enough for a final count and a data commit (New Zealand's
// specials alone take about two weeks), short enough that nobody forgets.
const GRACE_DAYS = 14;

const src = readFileSync(META, "utf-8");

const rows = [];
for (const line of src.split(/\r?\n/)) {
  const code = /\bcode:\s*"([a-z]{2})"/.exec(line);
  if (!code || !line.includes("href:")) continue;
  const name = /\bname:\s*"((?:[^"\\]|\\.)*)"/.exec(line);
  const date = /\bnextDate:\s*"(\d{4}-\d{2}-\d{2})"/.exec(line);
  const conf = /\bnextConfidence:\s*"(confirmed|expected|unscheduled|dissolved)"/.exec(line);
  rows.push({
    code: code[1],
    name: name ? name[1] : code[1],
    date: date ? date[1] : null,
    confidence: conf ? conf[1] : null,
  });
}

if (rows.length === 0) {
  console.error("check:election-dates — parsed no hubs from lib/electionHubsMeta.ts");
  process.exit(1);
}

// Compare at day resolution in UTC so the guard does not depend on the machine.
const now = new Date();
const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const dayjs = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const errors = [];
const warnings = [];
let confirmed = 0;

for (const r of rows) {
  if (!r.confidence) {
    warnings.push(`${r.code} (${r.name}): no nextConfidence, treated as "expected"`);
  }
  if (r.confidence === "confirmed") {
    confirmed += 1;
    if (!r.date) {
      errors.push(`${r.code} (${r.name}): nextConfidence "confirmed" with no nextDate`);
    }
  }
  if (r.confidence === "unscheduled" && r.date) {
    errors.push(`${r.code} (${r.name}): "unscheduled" but carries nextDate ${r.date}`);
  }
  if (r.confidence === "dissolved" && r.date) {
    errors.push(`${r.code} (${r.name}): "dissolved" but carries nextDate ${r.date}`);
  }
  if (!r.date) continue;

  const past = Math.round((today - dayjs(r.date)) / 86400000);
  if (past <= 0) continue;
  const msg =
    `${r.code} (${r.name}): next election ${r.date} passed ${past} day${past === 1 ? "" : "s"} ago — ` +
    `file the result, move \`last\` forward and set the new \`next\``;
  if (past > GRACE_DAYS) errors.push(msg);
  else warnings.push(`${msg} (grace period: ${GRACE_DAYS - past} day(s) left)`);
}

// ---- pass 2: result records whose date contradicts their own year ----
const MONTHS = ["january","february","march","april","may","june","july",
                "august","september","october","november","december"];
const MON = MONTHS.join("|");
const GAP = "\\s*(?:\\([^)]*\\)\\s*)?";
const DMY = new RegExp(`(\\d{1,2})${GAP}(${MON})${GAP}(\\d{4})`, "gi");
const MDY = new RegExp(`(${MON})${GAP}(\\d{1,2}),?${GAP}(\\d{4})`, "gi");

/** The year of the LAST full date in the string: when the election concluded. */
function lastDateYear(text) {
  if (!text) return null;
  let best = null;
  for (const re of [DMY, MDY]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(text)))) {
      const y = Number(re === DMY ? m[3] : m[3]);
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

const DATA = join(ROOT, "public", "data");
let recordsChecked = 0;
for (const f of readdirSync(DATA).filter((f) => f.endsWith("-elections.json")).sort()) {
  const code = f.split("-")[0];
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(DATA, f), "utf-8"));
  } catch {
    errors.push(`${f}: unreadable`);
    continue;
  }
  for (const e of doc.elections || []) {
    if (typeof e.year !== "number") continue;
    const y = lastDateYear(e.date);
    if (y === null) continue; // month- or year-only text: nothing to contradict
    recordsChecked++;
    if (y !== e.year && y !== e.year + 1) {
      errors.push(
        `${code} ${e.label ?? e.id}: year ${e.year} but date "${e.date}" ends in ${y} — ` +
          `the date string is not trustworthy (a citation date usually leaked in); ` +
          `read the article's infobox election_date and correct it`,
      );
    }
  }
}

for (const w of warnings) console.warn(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

if (errors.length) {
  console.error(
    `check:election-dates — ${errors.length} error(s) across ${rows.length} hubs and ` +
      `${recordsChecked} dated result records. Hub-date errors are fixed in ` +
      `lib/electionHubsMeta.ts; record-date errors in the named ` +
      `public/data/<code>-elections.json. Do not extend the grace period, and do ` +
      `not silence a record-date error by deleting the year it disagrees with.`,
  );
  process.exit(1);
}
console.log(
  `check:election-dates — OK (${rows.length} hubs, ${confirmed} with confirmed dates, ` +
    `${recordsChecked} dated result records, ${warnings.length} warning(s))`,
);
