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
 * Run as `npm run check:election-dates` or `npm run verify`.
 */

import { readFileSync } from "node:fs";
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
  const conf = /\bnextConfidence:\s*"(confirmed|expected|unscheduled)"/.exec(line);
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
  if (!r.date) continue;

  const past = Math.round((today - dayjs(r.date)) / 86400000);
  if (past <= 0) continue;
  const msg =
    `${r.code} (${r.name}): next election ${r.date} passed ${past} day${past === 1 ? "" : "s"} ago — ` +
    `file the result, move \`last\` forward and set the new \`next\``;
  if (past > GRACE_DAYS) errors.push(msg);
  else warnings.push(`${msg} (grace period: ${GRACE_DAYS - past} day(s) left)`);
}

for (const w of warnings) console.warn(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

if (errors.length) {
  console.error(
    `check:election-dates — ${errors.length} error(s) across ${rows.length} hubs. ` +
      `Fix lib/electionHubsMeta.ts; do not extend the grace period to make this pass.`,
  );
  process.exit(1);
}
console.log(
  `check:election-dates — OK (${rows.length} hubs, ${confirmed} with confirmed dates, ` +
    `${warnings.length} warning(s))`,
);
