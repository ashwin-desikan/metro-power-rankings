// Score tier vocabulary. The composite score is a continuous number, but
// readers want categorical labels they can quote in conversation. The bands
// below mirror the GaWC alpha/beta/gamma convention without requiring a
// reader to know the academic shorthand.
//
// Boundaries chosen from the live distribution (4,284 metros as of
// 2026-05-01): Global Capitals carve off the 9 metros above 100, Continental Metro
// captures the next 33, Major Metro the next 99, and so on down. The
// distribution is intentionally pyramid-shaped because the corpus is global
// rather than just elite — most metros in the world are local in scope, and
// the tier system reflects that honestly.
//
// Methodology page anchors each tier definition at /methodology#tiers so
// any external link to a tier name resolves to its formal definition.

export type Tier = {
  // Stable slug used in URLs and code (e.g. "world-city")
  slug: string;
  // Reader-facing name (e.g. "Continental Metro")
  name: string;
  // Lower-bound score (inclusive); upper-bound is the next tier's lowerBound
  lowerBound: number;
  // Short tagline shown next to the badge on metro pages
  tagline: string;
  // CSS color hint (Tailwind-friendly hex) for tier badges
  accentHex: string;
};

// Ordered highest to lowest. The first tier matching score >= lowerBound
// when iterated top-down wins.
export const TIERS: Tier[] = [
  {
    slug: "global-capital",
    name: "Global Capital",
    lowerBound: 100,
    tagline: "Top of the global hierarchy. Sets agenda across multiple dimensions.",
    accentHex: "#7c3aed",
  },
  {
    slug: "world-city",
    name: "Continental Metro",
    lowerBound: 50,
    tagline: "Globally significant. Material presence in finance, culture, and infrastructure.",
    accentHex: "#2563eb",
  },
  {
    slug: "major-metro",
    name: "Major Metro",
    lowerBound: 20,
    tagline: "Regionally dominant with reach beyond its borders.",
    accentHex: "#0891b2",
  },
  {
    slug: "regional-hub",
    name: "Regional Hub",
    lowerBound: 10,
    tagline: "Anchors a sub-national region. Serves a substantial catchment.",
    accentHex: "#16a34a",
  },
  {
    slug: "established-city",
    name: "Established Metro",
    lowerBound: 5,
    tagline: "Mature urban center with diversified economic and civic life.",
    accentHex: "#ca8a04",
  },
  {
    slug: "emerging-city",
    name: "Emerging Metro",
    lowerBound: 1,
    tagline: "Building presence on multiple dimensions; growth trajectory matters more than current rank.",
    accentHex: "#ea580c",
  },
  {
    slug: "local-city",
    name: "Local Metro",
    lowerBound: 0,
    tagline: "Primarily local in scope. Most of the world's metros sit here, and that is a feature.",
    accentHex: "#6b7280",
  },
];

// Resolve a numeric composite score to its tier. Always returns a tier
// because the lowest band has lowerBound 0 — every metro qualifies for
// at least Local Metro.
export function computeTier(score: number): Tier {
  for (const t of TIERS) {
    if (score >= t.lowerBound) return t;
  }
  return TIERS[TIERS.length - 1];
}

// Convenience for OG card / structured data: returns "Continental Metro" etc.
export function tierName(score: number): string {
  return computeTier(score).name;
}

// Stable URL anchor for /methodology#tier-{slug}
export function tierAnchor(score: number): string {
  return `tier-${computeTier(score).slug}`;
}
