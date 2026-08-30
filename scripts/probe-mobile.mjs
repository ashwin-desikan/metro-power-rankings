#!/usr/bin/env node
/**
 * Real-viewport mobile probe — the empirical half of DESIGN-STANDARDS.md's
 * mobile acceptance checklist.
 *
 * The static gate (scripts/check-mobile.mjs) catches the antipatterns we
 * know the names of. This catches the ones we don't: it loads real routes in
 * real Chromium at a real 390px viewport and measures what a thumb actually
 * gets. Every mobile regression this repo has shipped was invisible to source
 * review and obvious to this measurement.
 *
 * It reports, per route:
 *   - scrollWidth at 390px            → page-level sideways scroll (hard fail)
 *   - screens: scrollHeight / 844     → how many phone screens of thumb
 *   - ratio:   mobile screens / desktop screens
 *                                     → density collapse. A board that is
 *                                       1 screen on desktop and 30 on a phone
 *                                       lost its containment in the card
 *                                       fallback; see "Density by
 *                                       environment" in DESIGN-STANDARDS.md.
 *   - the widest offending element, when the page overflows, so the fix is
 *     one selector away instead of a bisect.
 *   - tap targets under 40px and text under 12px, counted.
 *
 * Usage:
 *   node scripts/probe-mobile.mjs                  # default route sample
 *   node scripts/probe-mobile.mjs /teams/f1 /power # explicit routes
 *   node scripts/probe-mobile.mjs --all            # every static route in app/
 *   BASE=http://localhost:3000 node scripts/probe-mobile.mjs
 *   node scripts/probe-mobile.mjs --json out.json --concurrency 6
 *
 * Requires a server already running at BASE (default http://localhost:3000)
 * and the `playwright` package. Both are deliberately NOT preconditions of
 * `npm run verify` — this is the manual/CI-optional deep check, and the
 * static gate is the one that runs on every commit.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// Thresholds. Tuned to the failures this repo has actually shipped, not to
// round numbers: /business overflowed at 390px, the US country page hit 9.3x.
//
// The two length numbers say different things and are judged differently.
// RATIO is the diagnostic one: a board that is 1 screen on desktop and 15 on
// a phone has lost containment the desktop rendering has, and that is always
// a bug. LENGTH alone is not — /methodology is a 28-screen essay at 1.8x,
// which is a long read on any device, not a broken one. So a long page fails
// only when it is ALSO disproportionate; otherwise it is reported as a
// warning, because what it needs is in-page navigation, not truncation.
const MAX_SCREENS = 25; // beyond this a phone page needs a way to jump
const LONG_PAGE_RATIO = 2.0; // …and beyond this too, it is a containment bug
const MAX_RATIO = 3.0; // mobile:desktop screen ratio — density collapse

/** Routes that between them exercise every layout family on the site. */
const DEFAULT_ROUTES = [
  "/",
  "/rankings",
  "/rankings/new-york",
  "/countries/united-states",
  "/business",
  "/business/companies",
  "/power",
  "/teams",
  "/teams/nfl",
  "/teams/nba",
  "/teams/f1",
  "/teams/cricket",
  "/teams/football",
  "/teams/national",
  "/sound",
  "/screen",
  "/elections",
  "/leaders",
  "/mayors",
  "/skyscrapers",
  "/geography",
  "/compare",
  "/time-machine",
  "/sports",
  "/predictions",
];

async function loadPlaywright() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    console.error(
      "probe-mobile: the `playwright` package is not installed.\n" +
        "  npm i -D playwright   (browsers: PLAYWRIGHT_BROWSERS_PATH is preset in CI images)\n" +
        "Skipping — the static gate `npm run check:mobile` still applies."
    );
    process.exit(0);
  }
}

/** Runs in the page. Returns the measurements for one viewport. */
function measure() {
  const doc = document.scrollingElement || document.documentElement;
  const vw = window.innerWidth;
  const out = {
    scrollWidth: Math.round(doc.scrollWidth),
    scrollHeight: Math.round(doc.scrollHeight),
    innerWidth: vw,
    offenders: [],
    smallTaps: 0,
    tinyText: 0,
  };

  // Widest elements that stick out past the viewport. Report the outermost
  // ones only — an overflowing table drags its ancestors with it and the
  // ancestor list is noise.
  if (doc.scrollWidth > vw + 1) {
    const hits = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const right = r.left + window.scrollX + r.width;
      if (right > vw + 1) {
        const style = getComputedStyle(el);
        // An element inside its own horizontal scroll box is contained by
        // design; that is the whole point of TableScroll.
        let contained = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === "auto" || ps.overflowX === "scroll" || ps.overflowX === "hidden") {
            contained = true;
            break;
          }
        }
        if (contained) continue;
        hits.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 120)) || "",
          width: Math.round(r.width),
          right: Math.round(right),
          overflowX: style.overflowX,
          depth: (() => {
            let d = 0;
            for (let p = el.parentElement; p; p = p.parentElement) d++;
            return d;
          })(),
        });
      }
    }
    hits.sort((a, b) => a.depth - b.depth || b.right - a.right);
    out.offenders = hits.slice(0, 4);
  }

  // Tap targets and legibility — WCAG 2.2 target size (minimum) is 24px;
  // this site's standard is 44px, so 40 is a forgiving floor that only
  // catches genuinely thumb-hostile controls.
  for (const el of document.querySelectorAll("a[href], button, [role='button'], summary, input, select")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Inline links inside a paragraph are text, not controls; skip them.
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    // Links inside a table cell are governed by the table rules (row
    // density, sticky identity column), not by the control standard —
    // counting them buried the handful of real offenders under a thousand
    // ordinary table rows.
    if (el.closest("td, th")) continue;
    if (r.height < 40) out.smallTaps++;
  }
  for (const el of document.querySelectorAll("p, li, td, th, span, div")) {
    if (!el.firstChild || el.firstChild.nodeType !== 3) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 12) out.tinyText++;
  }
  return out;
}

const args = process.argv.slice(2);
let jsonOut = null;
const jsonIdx = args.indexOf("--json");
if (jsonIdx !== -1) {
  jsonOut = args[jsonIdx + 1];
  args.splice(jsonIdx, 2);
}
let concurrency = 4;
const cIdx = args.indexOf("--concurrency");
if (cIdx !== -1) {
  concurrency = Math.max(1, Number(args[cIdx + 1]) || 4);
  args.splice(cIdx, 2);
}

/** Every statically addressable route under app/ — no dynamic segments. */
function allStaticRoutes() {
  const out = [];
  const walk = (dir, url) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) {
        if (name === "page.tsx") out.push(url || "/");
        continue;
      }
      if (name.startsWith("[") || name.startsWith("_") || name === "api") continue;
      // A route group's directory name does not appear in the URL.
      if (name.startsWith("(")) { walk(full, url); continue; }
      walk(full, `${url}/${name}`);
    }
  };
  walk(resolve("app"), "");
  return [...new Set(out)].sort();
}

const allIdx = args.indexOf("--all");
if (allIdx !== -1) args.splice(allIdx, 1);
const routes = args.length ? args : allIdx !== -1 ? allStaticRoutes() : DEFAULT_ROUTES;

const chromium = await loadPlaywright();
// The runner may ship a Chromium that predates the installed playwright's
// pinned build. CHROME_PATH lets the probe use whatever is actually there.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const results = [];
let failed = 0;

/** Measure one route at both viewports. */
async function probeRoute(route) {
  const url = BASE.replace(/\/$/, "") + route;
  const row = { route };
  try {
    for (const [key, vp] of [
      ["desktop", DESKTOP],
      ["phone", PHONE],
    ]) {
      const ctx = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: 1,
        isMobile: key === "phone",
        hasTouch: key === "phone",
      });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(400);
      row[key] = await page.evaluate(measure);

      // Scroll-jacking probe: a scrollspy that calls scrollIntoView can make
      // a page impossible to scroll, and every static check passes because
      // the document is never scrolled. Jump, wait, confirm the jump held.
      //
      // `behavior: "instant"` matters: globals.css sets `scroll-behavior:
      // smooth` sitewide, so a plain scrollTo ANIMATES, and on a 9,000px
      // page it is still gliding a second later. Sampling mid-glide
      // reported /sports/standings, /sports/heartbreak and /teams/football
      // as scroll-jacked when nothing was wrong with any of them.
      if (key === "phone" && row[key].scrollHeight > vp.height * 2) {
        const target = Math.round(row[key].scrollHeight * 0.6);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), target);
        await page.waitForTimeout(900);
        const held = await page.evaluate(() => Math.round(window.scrollY));
        row.scrollJack = Math.abs(held - target) > 250 ? { target, held } : null;
      }
      await ctx.close();
    }

    const screens = row.phone.scrollHeight / PHONE.height;
    const dScreens = row.desktop.scrollHeight / DESKTOP.height;
    row.screens = +screens.toFixed(1);
    row.desktopScreens = +dScreens.toFixed(1);
    row.ratio = +(screens / Math.max(dScreens, 0.1)).toFixed(1);
    row.overflow = row.phone.scrollWidth > PHONE.width + 1;

    row.fails = [];
    row.warns = [];
    if (row.overflow) row.fails.push(`sideways scroll (${row.phone.scrollWidth}px)`);
    if (row.ratio > MAX_RATIO) row.fails.push(`${row.ratio}x desktop length`);
    if (row.screens > MAX_SCREENS) {
      (row.ratio > LONG_PAGE_RATIO ? row.fails : row.warns).push(
        `${row.screens} phone screens` +
          (row.ratio > LONG_PAGE_RATIO ? "" : " (long on desktop too — give it in-page nav)")
      );
    }
    if (row.scrollJack) row.fails.push("scroll position did not hold");
    // NB: the counter is bumped once, by the worker that consumes this row.
    // Counting here too double-reported failures in the summary line.
  } catch (err) {
    row.error = String(err.message || err);
    row.fails = ["probe error"];
  }
  return row;
}

// A worker pool: a page load is almost entirely waiting, so a handful in
// flight turns a 259-route sweep from an hour into minutes.
const queue = [...routes];
async function worker() {
  for (;;) {
    const route = queue.shift();
    if (route === undefined) return;
    const row = await probeRoute(route);
    results.push(row);
    if (row.fails?.length) failed++;
    const tag = row.error ? "ERR " : row.fails.length ? "FAIL" : row.warns?.length ? "warn" : "ok  ";
    const detail = row.error
      ? row.error.slice(0, 70)
      : `${String(row.phone.scrollWidth).padStart(5)}px wide  ${String(row.screens).padStart(5)} screens  ${String(row.ratio).padStart(5)}x  taps<40:${row.phone.smallTaps}`;
    console.log(`${tag} ${route.padEnd(40)} ${detail}`);
    for (const f of [...(row.fails ?? []), ...(row.warns ?? [])])
      if (!row.error) console.log(`       \u21b3 ${f}`);
    for (const o of row.phone?.offenders ?? [])
      console.log(`       \u21b3 overflow: <${o.tag}> w=${o.width} right=${o.right} class="${o.cls.slice(0, 80)}"`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, worker));
results.sort((a, b) => routes.indexOf(a.route) - routes.indexOf(b.route));

await browser.close();

const warned = results.filter((r) => !r.fails?.length && r.warns?.length).length;
console.log(
  `\n${results.length - failed}/${results.length} routes clean at ${PHONE.width}px` +
    (warned ? `, ${warned} with warnings.` : ".")
);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  console.log(`wrote ${jsonOut}`);
}
process.exit(failed ? 1 : 0);
