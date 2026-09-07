#!/usr/bin/env node
/**
 * Function-size gate.
 *
 * On 2026-09-06 `api/og/compare` BUILT cleanly and then FAILED at the Vercel
 * deploy step: 255.19 MB uncompressed against Vercel's 250 MB serverless
 * function limit. `npm run verify` did not catch it, because the limit is a
 * deploy-time check and the build log is the only place it showed up -
 * AFTER a production build had already been spent. The route was fixed by
 * having it fetch its data instead of reading `public/data` through
 * `lib/data`'s runtime-built paths (see next.config.ts, the comment above
 * `outputFileTracingExcludes`).
 *
 * A local audit of the last native (non-webpack) build's traces the same day
 * found 106 routes sitting around 230 MB each, roughly 20 MB under the
 * line, with `public/data` growing daily. The next route to cross 250 MB
 * will fail the exact same silent way unless something local watches the
 * traced size before every push. This script is that watch: after
 * `next build`, it walks every `.nft.json` (Node file trace) Next.js writes
 * under `.next/server/app`, sums the real on-disk size of every file each
 * route's trace lists, and reports the ten biggest with how much of that is
 * `public/data`.
 *
 * Traced size overstates what actually ships to Vercel by a few percent:
 * the trace includes dev-only dependencies (types, source maps, some
 * devDependencies transitively required at trace time) that Vercel's own
 * bundler prunes before it enforces the 250 MB limit. Treat this gate's
 * numbers as a close, slightly-pessimistic proxy, not Vercel's exact count.
 *
 * Thresholds:
 *   WARN at 220 MB per route (console output, exit 0)
 *   FAIL at 245 MB per route (exit 1) - 235 MB under --strict
 *
 *   Why 245 and not 250: local traced size runs a few percent ABOVE what Vercel
 *   measures (dev-only dependencies get traced here), so 245 local is roughly
 *   230 on Vercel. Measured 2026-09-07: 106 routes at 230 to 238 MB local, every
 *   one of them carrying all of public/data because lib/data.ts builds its paths
 *   at runtime. That number only grows. The durable fix is not a threshold.
 *
 * Run: npm run check:function-size   (also the last step of `npm run verify`,
 * after `next build --webpack`, since only a real build produces traces.)
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_TRACE_DIR = path.join(ROOT, ".next/server/app");
const PUBLIC_DATA_DIR = path.join(ROOT, "public/data");
// Roots that exist on a developer box but never reach Vercel, because they are
// gitignored: the local caches and workbook extracts under /data (950 MB on
// the Windows box, swept into the admin routes' traces by a runtime path join),
// the workbooks, and session scratch. Counting them turns four admin routes
// into 900 MB phantoms and hides the real signal. Anything else the tracer
// finds is assumed to ship, which is the conservative direction.
const LOCAL_ONLY_ROOTS = ["data", "workbooks", "_scratch", ".git"].map((d) => path.join(ROOT, d));
let localOnlyBytes = 0;

const STRICT = process.argv.includes("--strict");
const WARN_BYTES = 220 * 1024 * 1024;
const FAIL_BYTES = (STRICT ? 235 : 245) * 1024 * 1024;

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function findTraceFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTraceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".nft.json")) {
      out.push(full);
    }
  }
  return out;
}

function routeNameFromTraceFile(traceFile) {
  // .../.next/server/app/api/og/compare/route.js.nft.json
  //   -> /api/og/compare
  const rel = path.relative(APP_TRACE_DIR, traceFile);
  return "/" + rel.replace(/\.nft\.json$/, "").replace(/\/(page|route)\.js$/, "");
}

function measureRoute(traceFile) {
  const dir = path.dirname(traceFile);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  } catch (err) {
    return { totalBytes: 0, dataBytes: 0, missing: 0, error: String(err) };
  }
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  let totalBytes = 0;
  let dataBytes = 0;
  let missing = 0;
  // Dedup: the same file (e.g. a shared chunk) can appear more than once
  // across a route's own trace; Vercel packages each traced file once.
  const seen = new Set();
  for (const rel of files) {
    const abs = path.resolve(dir, rel);
    if (seen.has(abs)) continue;
    seen.add(abs);
    let size;
    try {
      size = fs.statSync(abs).size;
    } catch {
      missing++;
      continue;
    }
    if (LOCAL_ONLY_ROOTS.some((r) => abs === r || abs.startsWith(r + path.sep))) {
      localOnlyBytes += size;
      continue;
    }
    totalBytes += size;
    if (abs.startsWith(PUBLIC_DATA_DIR + path.sep) || abs === PUBLIC_DATA_DIR) {
      dataBytes += size;
    }
  }
  return { totalBytes, dataBytes, missing };
}

function main() {
  if (!fs.existsSync(APP_TRACE_DIR)) {
    console.log(
      "SKIP: .next/server/app not found - run `next build` first (this gate " +
        "only runs after a real build produces trace files).",
    );
    process.exit(0);
  }

  const traceFiles = findTraceFiles(APP_TRACE_DIR);
  if (traceFiles.length === 0) {
    console.log(
      "SKIP: no *.nft.json trace files found under .next/server/app - the " +
        "build may be interrupted or incomplete. Run a full `next build` " +
        "and try again.",
    );
    process.exit(0);
  }

  const routes = traceFiles.map((traceFile) => {
    const { totalBytes, dataBytes, missing } = measureRoute(traceFile);
    return {
      route: routeNameFromTraceFile(traceFile),
      traceFile,
      totalBytes,
      dataBytes,
      missing,
    };
  });

  routes.sort((a, b) => b.totalBytes - a.totalBytes);

  if (localOnlyBytes > 0) {
    console.log(
      `Ignored ${fmtMB(localOnlyBytes)} MB of traced files under gitignored ` +
        "local roots (data/, workbooks/, _scratch/): they never reach Vercel.",
    );
  }

  console.log(
    `Traced ${routes.length} routes under .next/server/app. Note: traced ` +
      "size runs a few percent ABOVE what Vercel actually ships, because " +
      "the trace also sweeps in dev-only deps (types, source maps, some " +
      "devDependencies) that Vercel's bundler prunes before enforcing its " +
      "250 MB uncompressed function limit.",
  );
  console.log("");
  console.log("Ten largest traced routes:");
  const top10 = routes.slice(0, 10);
  for (const r of top10) {
    const dataShare =
      r.totalBytes > 0 ? ((r.dataBytes / r.totalBytes) * 100).toFixed(0) : "0";
    const missingNote = r.missing > 0 ? ` (${r.missing} traced files missing on disk)` : "";
    console.log(
      `  ${fmtMB(r.totalBytes).padStart(8)} MB  ${r.route}` +
        `  [public/data: ${fmtMB(r.dataBytes)} MB, ${dataShare}%]${missingNote}`,
    );
  }
  console.log("");

  let warnCount = 0;
  let failCount = 0;
  const failedRoutes = [];
  for (const r of routes) {
    if (r.totalBytes >= FAIL_BYTES) {
      failCount++;
      failedRoutes.push(r);
    } else if (r.totalBytes >= WARN_BYTES) {
      warnCount++;
    }
  }

  const failMB = fmtMB(FAIL_BYTES);
  const warnMB = fmtMB(WARN_BYTES);

  if (failCount > 0) {
    console.error(
      `FAIL: ${failCount} route(s) at or above ${failMB} MB traced` +
        `${STRICT ? " (--strict)" : ""}:`,
    );
    for (const r of failedRoutes) {
      console.error(`  ${fmtMB(r.totalBytes)} MB  ${r.route}`);
    }
    console.error("");
    console.error(
      "A red result here means shrink the function before pushing, never " +
        "push and hope: Vercel's deploy-time limit is enforced AFTER a " +
        "successful build, so a build that passes locally can still fail in " +
        "production and spend the build for nothing (api/og/compare,  " +
        "2026-09-06). Make the route fetch its data instead of importing it " +
        "as a value, or otherwise cut what it traces - do not raise this " +
        "threshold to make the gate pass.",
    );
    process.exit(1);
  }

  if (warnCount > 0) {
    console.warn(
      `WARN: ${warnCount} route(s) at or above ${warnMB} MB traced, under ` +
        `${STRICT ? "the --strict " : ""}FAIL line of ${failMB} MB. Keep an ` +
        "eye on public/data growth; these are the routes closest to failing " +
        "at deploy time next.",
    );
  } else {
    console.log(`OK: no route traced at or above ${warnMB} MB.`);
  }
}

main();
