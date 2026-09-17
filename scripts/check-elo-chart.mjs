/**
 * Prove the season Elo chart renders what it is supposed to, in a real browser.
 *
 * The chart is client-only: it sizes itself from a ResizeObserver, so the
 * server sends no SVG at all and every static check (grep the HTML, read the
 * build output) sees an empty page and passes. Three of the four things this
 * checks are therefore INVISIBLE to `npm run verify`, which is exactly why
 * they shipped wrong:
 *
 *   1. The x-axis shows DATES, not the workbook's internal week counter.
 *   2. The year appears where the season crosses into January, and not on
 *      every label.
 *   3. A carried week (no game: a bye, or the weeks after elimination) draws
 *      DASHED, so a flat line is never mistaken for a measured one.
 *   4. Leaving the plot with a mouse clears the highlight and the readout.
 *      A hover that outlives the pointer reads as a selection nobody made.
 *
 * Usage:  node scripts/check-elo-chart.mjs [baseUrl]
 * Needs a server already running (npm run start).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
const ROUTES = [
  { url: "/teams/nba/season/2026", label: "NBA 2026" },
  { url: "/teams/nfl/season/2025", label: "NFL 2025" },
];

const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`  FAIL ${label}: ${msg}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const { url, label } of ROUTES) {
  console.log(`\n${label}  ${url}`);
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForSelector("svg path[stroke-linecap='round']", { timeout: 15000 })
    .catch(() => {});

  // --- 1 and 2: the axis
  const ticks = await page.$$eval(
    "svg text",
    (els) => els.map((e) => e.textContent.trim()).filter(Boolean),
  );
  const axis = ticks.filter((t) => MONTHS.test(t));
  const weekish = ticks.filter((t) => /^wk \d+$/.test(t));
  console.log(`  axis labels with a month: ${axis.length}  (${axis.slice(0, 7).join(", ")})`);
  if (axis.length < 3) fail(label, `expected date ticks, saw ${axis.length}`);
  if (weekish.length) fail(label, `still showing week numbers: ${weekish.join(", ")}`);
  const withYear = axis.filter((t) => /\b\d{2}$/.test(t));
  console.log(`  ticks carrying a year: ${withYear.length}  (${withYear.join(", ")})`);
  // First tick always, plus one at the January crossing. More than three means
  // the year is repeating and the label is wasting width.
  if (withYear.length < 1) fail(label, "no tick carries a year");
  if (withYear.length > 3) fail(label, `year repeated on ${withYear.length} ticks`);

  // --- 3: dashed segments for carried weeks
  const dashed = await page.$$eval(
    "svg path",
    (els) => els.filter((e) => (e.getAttribute("stroke-dasharray") || "").trim() === "3 3").length,
  );
  console.log(`  dashed (held) line segments: ${dashed}`);
  if (dashed < 1) fail(label, "no dashed segments: carried weeks are drawing solid");

  // --- 4: the hover must not outlive the pointer
  //
  // ⚠️ SELECTORS MATTER MORE THAN THE ASSERTION HERE, and the first version of
  // this check got both wrong in a way that produced a confident false
  // failure. `page.$("svg")` returns the page's FIRST svg, which is a sport
  // icon in the header, so the mouse never touched the chart. And
  // `[aria-live='polite']` also matches the week scrubber's own status span,
  // so the captured string was the scrubber's label plus the readout's
  // placeholder hint, identical before and after by construction. Target the
  // svg that actually has plotted lines, and the readout paragraph alone.
  // A season page carries SEVERAL charts (the Elo race, the preseason
  // variant, expectation, the seed timeline), and only some own a readout.
  // Picking .first() found the wrong one on the NFL page and reported a
  // confident failure against working code. So: try each candidate, keep the
  // one that actually moves its readout, and only fail if none of them do.
  const readout = () => page.$$eval("p[aria-live='polite']", (e) =>
    e.map((x) => x.textContent.trim()).filter(Boolean).join(" | "));
  const cands = await page.locator("svg:has(path[stroke-linecap='round'])").all();
  let before = "", during = "", after = "", used = -1;
  for (let i = 0; i < cands.length; i++) {
    await cands[i].scrollIntoViewIfNeeded().catch(() => {});
    const b = await cands[i].boundingBox();
    if (!b || b.width < 200) continue;
    const idle = await readout();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.waitForTimeout(250);
    const hov = await readout();
    if (hov === idle) continue;            // not the chart with the readout
    await page.mouse.move(b.x + b.width * 0.5, b.y - 150);
    await page.waitForTimeout(350);
    before = idle; during = hov; after = await readout(); used = i;
    break;
  }
  if (used < 0) {
    fail(label, `no chart of ${cands.length} responded to a hover`);
    continue;
  }
  console.log(`  hovered chart #${used + 1} of ${cands.length}`);
  console.log(`  readout idle    : ${before.slice(0, 54)}`);
  console.log(`  readout hovering: ${during.slice(0, 54)}`);
  console.log(`  readout left    : ${after.slice(0, 54)}`);
  if (during && after && during === after) {
    fail(label, "the readout survived the pointer leaving the chart");
  }
}

await browser.close();
console.log(failures ? `\ncheck:elo-chart - ${failures} FAILURE(S)` : "\ncheck:elo-chart - OK");
process.exit(failures ? 1 : 0);
