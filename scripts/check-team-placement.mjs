#!/usr/bin/env node
/**
 * Team-placement guard.
 *
 * Team rows are joined to a metro by city name. Names are not unique across
 * countries, so a row can land on the wrong continent without anything
 * erroring: Zamora CF (Spain) sat on Zamora, Mexico; Bristol Motor Speedway
 * (Tennessee) sat on Bristol, UK; Club Leon (Mexico) sat on Leon, Spain. All
 * of them rendered happily on the wrong metro page. Same root cause as the
 * slug damage check:slug-drift guards: an identifier matched without the
 * constraint that makes it unique.
 *
 * Two rules, both chosen from the measured distribution (2026-08-09):
 *
 *   1. Country mismatch AND > 100 km. Country mismatch ALONE is useless — 329
 *      rows have it, almost all England/Wales/Northern Ireland listed against
 *      a "United Kingdom" metro, plus Auckland FC playing in the Australian
 *      league. But mismatch + distance isolates the real thing exactly: the
 *      nearest legitimate case is London <- Basingstoke Town at 71.9 km and
 *      the nearest genuine error is 2,409 km, so 100 km sits in open space.
 *
 *   2. Over 250 km from the metro centre, whatever the country. Catches the
 *      bad-coordinate class — four PWHL rows carrying Seattle's coordinates,
 *      four Major League Cricket rows carrying one point in Oklahoma.
 *
 * Rule 2 is a RATCHET against scripts/team-placement-baseline.json. Shrink it
 * as rows are corrected in the workbook; never grow it.
 *
 * Exit 0 on success (warnings allowed), exit 1 on any hard failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DETAILS = path.join(ROOT, 'public/data/details');
const BASELINE = path.join(ROOT, 'scripts/team-placement-baseline.json');

const CROSS_BORDER_KM = 100;
const FAR_KM = 250;

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };
const warn = (msg) => { warnings++; console.warn(`WARN: ${msg}`); };
const ok = (msg) => console.log(`OK:   ${msg}`);

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

if (!fs.existsSync(DETAILS)) { fail(`no detail files at ${path.relative(ROOT, DETAILS)}`); process.exit(1); }

const violations = [];
let scanned = 0;
let withCoords = 0;

for (const file of fs.readdirSync(DETAILS)) {
  if (!file.endsWith('.json')) continue;
  let detail;
  try { detail = JSON.parse(fs.readFileSync(path.join(DETAILS, file), 'utf8')); }
  catch { fail(`${file} does not parse`); continue; }
  const metro = detail.metro;
  if (!metro?.lat || !metro?.lon) continue;
  scanned++;
  for (const team of detail.teams || []) {
    if (!team?.lat || !team?.lng) continue;
    withCoords++;
    const d = km(metro.lat, metro.lon, team.lat, team.lng);
    const crossBorder = team.country && metro.country && team.country !== metro.country;
    if (crossBorder && d > CROSS_BORDER_KM) {
      violations.push({ rule: 1, key: `${metro.slug}|${team.team}`, d: Math.round(d), metro: metro.name, metroCountry: metro.country, team: team.team, teamCountry: team.country });
    } else if (d > FAR_KM) {
      violations.push({ rule: 2, key: `${metro.slug}|${team.team}`, d: Math.round(d), metro: metro.name, metroCountry: metro.country, team: team.team, teamCountry: team.country });
    }
  }
}

if (process.argv.includes('--write-baseline')) {
  const payload = {
    note: 'Ratchet for scripts/check-team-placement.mjs. Each entry is a known-misplaced team row awaiting a workbook correction. SHRINK this as rows are fixed; never grow it. See "Misplaced Team Rows 2026-08-09.xlsx".',
    generated: 'measured against the tree at the time of writing',
    entries: violations.map((v) => v.key).sort(),
  };
  fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, BASELINE)} (${violations.length} entries)`);
  process.exit(0);
}

let baseline = { entries: [] };
if (fs.existsSync(BASELINE)) {
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
  catch (e) { fail(`baseline does not parse: ${e.message}`); process.exit(1); }
} else {
  warn('no baseline yet — every violation below will fail. Seed it with --write-baseline.');
}
const known = new Set(baseline.entries || []);
const fresh = violations.filter((v) => !known.has(v.key));
const seen = new Set(violations.map((v) => v.key));
const fixed = [...known].filter((k) => !seen.has(k));

if (fresh.length) {
  fail(`${fresh.length} team row(s) placed on a metro they cannot belong to:`);
  for (const v of fresh.sort((a, b) => b.d - a.d).slice(0, 20)) {
    const why = v.rule === 1 ? `${v.teamCountry} team on a ${v.metroCountry} metro` : 'implausible distance';
    console.error(`        ${String(v.d).padStart(6)} km  ${v.metro} <- ${v.team}  (${why})`);
  }
  console.error('      Fix the row in the workbook Team List, or add it to scripts/team-placement-baseline.json with a reason.');
} else {
  ok(`${withCoords.toLocaleString()} team rows across ${scanned.toLocaleString()} metros, no new misplacements`);
}

const carried = violations.length - fresh.length;
if (carried) ok(`${carried} known violation(s) still carried in the baseline, awaiting a workbook fix`);
if (fixed.length) warn(`${fixed.length} baseline entry(ies) no longer violate — shrink the ratchet: ${fixed.slice(0, 6).join(', ')}${fixed.length > 6 ? ', ...' : ''}`);

console.log(`check-team-placement ${failures ? 'FAILED' : 'OK'} (${failures} failure(s), ${warnings} warning(s))`);
process.exit(failures ? 1 : 0);
