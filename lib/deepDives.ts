// Unified registry of editorial "deep dives": interactive on-site features
// that may also exist as a Substack essay. Single source of truth for the
// /deep-dives hub and the Deep Dives nav. Pure data (client- and server-safe).

export type DeepDiveDomain = "sports" | "metros" | "culture";

export type DeepDive = {
  slug: string;
  title: string;
  dek: string;
  href: string; // canonical on-site page
  tag: string;
  domain: DeepDiveDomain;
  accent: string;
  substackUrl?: string; // matching essay, if any (dedup + cross-link)
  featured?: boolean; // pinned spotlight on the hub
};

export const DEEP_DIVES: DeepDive[] = [
  {
    slug: "geography-of-erasure",
    title: "The Geography of Erasure",
    dek: "The champions the map forgot: dominant clubs erased when the metro behind them was outgrown by the modern league.",
    href: "/sports/geography-of-erasure",
    tag: "Ghost franchises",
    domain: "sports",
    accent: "#4ECDC4",
    substackUrl: "https://citizenofnowhere.substack.com/p/the-geography-of-erasure",
    featured: true,
  },
  {
    slug: "greatest-games",
    title: "The Greatest Games",
    dek: "The top games of all-time by Game Score across the NFL, NBA and MLB, plus every Stanley Cup presentation game.",
    href: "/sports/games",
    tag: "Cross-sport",
    domain: "sports",
    accent: "#a855f7",
  },
  {
    slug: "team-valuations",
    title: "Team Valuations",
    dek: "Franchise values across the NFL, NBA, MLB, NHL and global soccer, on one sortable board.",
    href: "/sports/valuations",
    tag: "Cross-sport",
    domain: "sports",
    accent: "#f59e0b",
  },
  {
    slug: "team-that-wins-the-city",
    title: "The Team That Wins the City",
    dek: "One crest per metro: the club whose disappearance would change what the metro is, not the one with the most trophies.",
    href: "/top-teams",
    tag: "Every metro",
    domain: "sports",
    accent: "#D4537E",
  },
  {
    slug: "last-of-the-marylebones",
    title: "The Last of the Marylebones",
    dek: "A taxonomy of the world's dense, historic, walkable, elite residential neighborhoods. A small qualifying set out of the full metro corpus.",
    href: "/neighborhoods",
    tag: "Global neighborhoods",
    domain: "metros",
    accent: "#639922",
  },
  {
    slug: "velvet-rock-capital",
    title: "Velvet Rock Capital",
    dek: "The producer-driven adult-pop catalog of 1974 to 1989, mapped: six cities and two islands that yacht rock flattened into a beach trope.",
    href: "/badges/velvet-rock-capital",
    tag: "Cultural geography",
    domain: "culture",
    accent: "#378ADD",
    substackUrl: "https://citizenofnowhere.substack.com/p/velvet-rock-the-map-yacht-rock-erased",
  },
];

export function featuredDeepDive(): DeepDive {
  return DEEP_DIVES.find((d) => d.featured) ?? DEEP_DIVES[0];
}

// Substack URLs already represented by an on-site feature, so the Writing
// zone can drop them and avoid showing a piece twice.
export const DEEP_DIVE_SUBSTACK_URLS = new Set(
  DEEP_DIVES.map((d) => d.substackUrl).filter((u): u is string => !!u),
);
