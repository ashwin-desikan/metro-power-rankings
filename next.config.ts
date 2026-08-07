import type { NextConfig } from "next";

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
  outputFileTracingExcludes: {
    "*": ["public/data/boundaries-simplified.json"],
  },
  async redirects() {
    return [
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
