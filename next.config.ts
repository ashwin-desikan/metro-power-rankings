import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Slugs that have moved. lib/metroRedirects.json is the single source of
// truth, shared with scripts/check-slug-drift.mjs, which fails `npm run
// verify` if a slug leaves the build without an entry here. Read rather than
// imported so the guard and the config can never diverge on module resolution.
const slugRedirects = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "lib/metroRedirects.json"), "utf8"),
) as {
  metros: Record<string, string>;
  screenMetros: Record<string, string>;
  competitions: Record<string, string>;
};

const movedSlugRedirects = [
  ...Object.entries(slugRedirects.metros).map(([from, to]) => ({
    source: `/rankings/${from}`,
    destination: `/rankings/${to}`,
    permanent: true,
  })),
  ...Object.entries(slugRedirects.screenMetros).map(([from, to]) => ({
    source: `/screen/metros/${from}`,
    destination: `/screen/metros/${to}`,
    permanent: true,
  })),
  ...Object.entries(slugRedirects.competitions).map(([from, to]) => ({
    source: `/sports/champions/${from}`,
    destination: `/sports/champions/${to}`,
    permanent: true,
  })),
];

const nextConfig: NextConfig = {
  experimental: {
    // Shorter client-side Router Cache so revisiting a live page (e.g.
    // /sports/standings) shows current data without a hard refresh instead of a
    // minutes-old cached view held from a prior visit.
    staleTimes: { dynamic: 30, static: 30 },
  },
  images: {
    unoptimized: true,
  },
  // boundaries-simplified.json (21.6MB) is fetched client-side only
  // (lib/useMetroBoundaries.ts); no server function reads it via fs, so
  // keep it out of every serverless function trace. Honored under the
  // webpack builder (see build script); Turbopack ignores this today.
  // 🔴 lib/data.ts BUILDS ITS PATHS AT RUNTIME, so the tracer cannot see which
  // files it reads and bundles the WHOLE of public/data (259 MB) into every
  // function that imports it. On 2026-09-06 api/og/compare crossed Vercel's
  // 250 MB uncompressed function limit at 255.19 MB and the deploy FAILED
  // AFTER a successful build. `npm run verify` cannot catch that: the limit is
  // a deploy-time check, so the Vercel build log is the only place it shows up.
  //
  // Per-route `outputFileTracingExcludes` was tried as the fix and DOES NOT
  // WORK for App Router handlers here, on either "/api/og/compare" or
  // "/api/og/compare/route". The "*" rule below does work, which is how we
  // know the mechanism is fine and the route key is not. Do not spend the hour
  // again. The route was fixed instead by making it fetch its data rather than
  // read it (see app/api/og/compare/route.tsx).
  //
  // 🔴 THE NEXT FUNCTION TO CROSS 250 MB WILL FAIL THE SAME SILENT WAY. Any
  // route that imports lib/data as a VALUE carries all of public/data, and
  // public/data only grows. The durable fix is for lib/data.ts to read through
  // a statically analysable map, or for these readers to fetch from GitHub raw
  // the way lib/nflElo.ts already does.
  outputFileTracingExcludes: {
    "*": ["public/data/boundaries-simplified.json"],
  },
  async redirects() {
    return [
      ...movedSlugRedirects,
      // The NFL-only expectation board is now the cross-sport deep dive at
      // /sports/expectation, which leads with the finding instead of the
      // metric. The per-season NFL game logs at /teams/nfl/expectation/[season]
      // are untouched — they are a different object and still useful.
      {
        source: "/teams/nfl/expectation",
        destination: "/sports/expectation",
        permanent: true,
      },
      // Cross-sport deep dives live at /sports/<slug>; /deep-dives is the hub.
      // Honour the other address anyway.
      {
        source: "/deep-dives/expectation",
        destination: "/sports/expectation",
        permanent: true,
      },
      // Metro renamed: Tula, Mexico slug changed from tula-mexico to
      // tula-de-allende (formal metro name). Preserve the old indexed URL.
      {
        source: "/rankings/tula-mexico",
        destination: "/rankings/tula-de-allende",
        permanent: true,
      },
      // Original Ottawa Senators / St. Louis Eagles dynasty: canonical name
      // changed from "Eagles" to "Senators (Org)" (slug senators-org).
      {
        source: "/teams/nhl/eagles",
        destination: "/teams/nhl/senators-org",
        permanent: true,
      },
      // Page renamed from "Governors" to "United States Political Leadership".
      {
        source: "/governors",
        destination: "/us-political-leadership",
        permanent: true,
      },
      // Historical power ranking renamed from "The Great Powers" to "The Power Atlas".
      {
        source: "/great-powers",
        destination: "/power-atlas",
        permanent: true,
      },
      // Badge slug renames that never got migrated into published writing.
      // Three published Substack essays (Greying Power, and both Sovereign City
      // Index drafts) link /badges/academic-gravity-wells, and Greying Power also
      // links /badges/skyline-cities. Both 404'd until 2026-08-07. The essay names
      // and the badge slugs diverged: "Academic Gravity Wells" is the essay title,
      // "University Town" is the badge (lib/badges.ts). Redirecting is the durable
      // fix, because the copies live in published posts we do not control.
      {
        source: "/badges/academic-gravity-wells",
        destination: "/badges/university-town",
        permanent: true,
      },
      {
        source: "/badges/skyline-cities",
        destination: "/badges/skyline-city",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
