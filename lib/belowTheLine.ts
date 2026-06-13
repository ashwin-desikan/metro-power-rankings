import "server-only";

// "Below the Line" clubs: active clubs that have dropped BELOW the level we
// track for their sport. They are not defunct, and deliberately not in the
// Team List (which represents only the current, high-enough tier per sport),
// so they never enter public/data/sports/all-teams.json and never appear on
// the Sports map or metro cards. They still earn a lightweight club page here,
// tagged so readers understand why they are absent from the directory.
//
// (The name is "Below the Line" rather than "Off the Map" because the latter
// reads as defunct/erased, which is the separate Ghost Franchise concept. These
// clubs are alive and playing, just beneath the tracked line.)
//
// Candidates are auto-derived from the honour rolls (winners with no Team List
// match) and classified by the user via below-the-line-review.xlsx. Honours
// come from the roll, by name, so there is no second source to keep in sync.
//
// Server-only: it reads the honours JSON via getHonourPortal. Listed in
// scripts/check-client-imports.mjs alongside the other server-only libs.

import { getHonourPortal } from "./honourRolls";

export type BelowLineClub = {
  slug: string;
  name: string;
  /** Names as they appear in the roll, if different from `name`. */
  aliases?: string[];
  sport: string;
  /** Honours JSON key under public/data/honours, e.g. "rugby-league". */
  portalKey: string;
  /** Roll within that portal, e.g. "superleague". */
  rollKey: string;
  /** Back-link to the parent portal hub. */
  portalHref: string;
  portalLabel: string;
  /** Current tier, in your words. Optional: when unset, the page says the club
   *  plays below the tracked level without naming a specific division. */
  currentLevel?: string;
  /** Only set when known; never guessed (Team List remains the metro spine). */
  metro?: string;
  blurb?: string;
};

export const BELOW_LINE_CLUBS: BelowLineClub[] = [
  // (Featherstone Rovers was the original example but went bankrupt in early
  // 2026, so it is classified DEFUNCT, not below the line, and gets no page.)

  // Domestic Handball (Bundesliga) — historical champions now below the tier.
  // Current levels pending from the user; the page degrades gracefully without.
  { slug: "tv-grosswallstadt", name: "TV Großwallstadt", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },
  { slug: "sv-polizei-hamburg", name: "SV Polizei Hamburg", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },
  { slug: "tusem-essen", name: "TUSEM Essen", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },
  { slug: "berliner-sv-1892", name: "Berliner SV 1892", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },
  { slug: "sg-wallau-massenheim", name: "SG Wallau-Massenheim", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },
  { slug: "sg-leutershausen", name: "SG Leutershausen", sport: "Handball", portalKey: "handball-domestic", rollKey: "bundesliga", portalHref: "/teams/handball/domestic", portalLabel: "Domestic Handball" },

  // Domestic Volleyball (SuperLega). Roll lists Treviso under the sponsor name
  // "Sisley Treviso"; canonical per user is "Volley Treviso".
  { slug: "volley-treviso", name: "Volley Treviso", aliases: ["Sisley Treviso"], sport: "Volleyball", portalKey: "volleyball-domestic", rollKey: "superlega", portalHref: "/teams/volleyball/domestic", portalLabel: "Domestic Volleyball" },
];

// Cross-sport / external links from a roll winner name to an existing page on
// the site (not a Below the Line page). Keyed by portalKey, then roll name.
// e.g. the rugby league "Bradford F.C." is the same institution as the football
// club Bradford Park Avenue, which already has a club page.
export const ROLL_CROSS_LINKS: Record<string, Record<string, string>> = {
  "rugby-league": {
    "Bradford F.C.": "/teams/football/bradford-park-avenue",
  },
};

// Roll winner names that are sponsor/era ALIASES of a club already in the Team
// List, keyed by portalKey. Their titles should be credited to that Team List
// club on its metro card. Consumed by the (pending) roll-to-metro-card wiring,
// inert until then. Captured here so the user's verdicts are not lost.
//
// NOTE: the Team List entry (was "Valsa Group Modena") is being renamed by the
// user to "Modena Volley", the canonical used here.
export const ROLL_TO_TEAMLIST_ALIASES: Record<string, Record<string, string>> = {
  "handball-domestic": {
    "Grün-Weiß Dankersen": "GWD Minden",
  },
  "volleyball-domestic": {
    // Modena Volley lineage (historic Pallavolo Modena, by sponsor era).
    "Panini Modena": "Modena Volley",
    "DHL Modena": "Modena Volley",
    "Daytona Las Modena": "Modena Volley",
    "Las Daytona Modena": "Modena Volley",
    "Unibon Modena": "Modena Volley",
    "Itas Diatec Trentino": "Trentino Volley",
    "Mostostal Azoty Kędzierzyn-Koźle": "ZAKSA Kędzierzyn-Koźle",
    // Interauto Modena is the (defunct) Avia Pervia Modena, NOT Modena Volley:
    //   https://en.wikipedia.org/wiki/Avia_Pervia_Modena
    // Crocetta Modena and Minelli Modena: unresolved (user TBD).
  },
};

export type ClubHonours = { titles: string[]; runnersUp: string[]; rollLabel: string };

export function getBelowLineClub(slug: string): BelowLineClub | null {
  return BELOW_LINE_CLUBS.find((c) => c.slug === slug) ?? null;
}

// Titles and runner-up seasons pulled from the roll by name, newest-first to
// match the site-wide season-table convention.
export function honoursForClub(c: BelowLineClub): ClubHonours {
  const portal = getHonourPortal(c.portalKey);
  const rows = portal?.rolls[c.rollKey] ?? [];
  const names = new Set([c.name, ...(c.aliases ?? [])]);
  const titles = rows.filter((r) => names.has(r.winner)).map((r) => r.season).reverse();
  const runnersUp = rows
    .filter((r) => r.ru != null && names.has(r.ru))
    .map((r) => r.season)
    .reverse();
  return { titles, runnersUp, rollLabel: portal?.labels[c.rollKey] ?? c.rollKey };
}

// name -> href for a given portal: Below the Line club pages plus any cross-sport
// links, so HonourRolls can turn a winning club name into a link.
export function belowLineLinksForPortal(portalKey: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of BELOW_LINE_CLUBS.filter((x) => x.portalKey === portalKey)) {
    for (const n of [c.name, ...(c.aliases ?? [])]) m[n] = `/teams/below-the-line/${c.slug}`;
  }
  for (const [name, href] of Object.entries(ROLL_CROSS_LINKS[portalKey] ?? {})) m[name] = href;
  return m;
}
