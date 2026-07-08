import "server-only";

// British rugby league champions that have no live Team List card, surfaced on
// metro pages the same way other sports handle defunct clubs. Titles are read
// from the honours roll (public/data/honours/rugby-league.json) by name, so the
// roll stays the single source of truth and the annual auto-updater keeps this
// in sync — there is no second ledger to maintain.
//
// Two cases:
//   1. Defunct champions absent from the Team List (Broughton Rangers,
//      Manningham, Featherstone Rovers) -> former-team cards in their metro's
//      "Other / former teams" block, associated to a metro via a sibling club.
//   2. A champion tracked under a DIFFERENT sport: Bradford Park Avenue is a
//      football club (it won the 1903-04 title as "Bradford F.C."), so its RL
//      title shows as a cross-sport chip on its existing football card.
//
// Server-only: reads the honours JSON via getHonourPortal. Listed in
// scripts/check-client-imports.mjs alongside the other server-only libs.

import { getHonourPortal } from "./honourRolls";

const PORTAL = "rugby-league";
const ROLL = "superleague";
const HUB = "/teams/rugby-league/british";

export type DefunctRLClub = {
  /** Canonical club name shown on the card. */
  club: string;
  titles: number;
  /** Seasons won, newest-first (e.g. "1976–77"). */
  years: string[];
  firstYear: number | null;
  lastYear: number | null;
  /** Non-null only when the club has a page; defunct RL clubs have none. */
  href: string | null;
};

// Roll winner name -> canonical name + era-correct metro (via a sibling club:
// Broughton/Salford -> Manchester, Manningham/Bradford & Featherstone/Wakefield
// district -> Leeds-Bradford).
const DEFUNCT: { roll: string; club: string; metroSlug: string }[] = [
  { roll: "Broughton", club: "Broughton Rangers", metroSlug: "manchester" },
  { roll: "Manningham", club: "Manningham", metroSlug: "leeds-bradford" },
  { roll: "Featherstone Rovers", club: "Featherstone Rovers", metroSlug: "leeds-bradford" },
];

// Clubs tracked under another sport whose RL title should appear as a chip on
// their existing card. Team List name -> roll winner name.
const CROSS_SPORT: Record<string, string> = {
  "Bradford Park Avenue": "Bradford F.C.",
};

function seasonYear(season: string): number | null {
  const m = season.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function titlesFor(rollName: string): { years: string[]; firstYear: number | null; lastYear: number | null } {
  const portal = getHonourPortal(PORTAL);
  const rows = portal?.rolls[ROLL] ?? [];
  const years = rows.filter((r) => r.winner === rollName).map((r) => r.season);
  const nums = years.map(seasonYear).filter((n): n is number => n != null);
  return {
    years: [...years].reverse(), // newest-first, matching the site convention
    firstYear: nums.length ? Math.min(...nums) : null,
    lastYear: nums.length ? Math.max(...nums) : null,
  };
}

export function getDefunctBritishRLForMetro(metroSlug: string): DefunctRLClub[] {
  const out: DefunctRLClub[] = [];
  for (const d of DEFUNCT) {
    if (d.metroSlug !== metroSlug) continue;
    const { years, firstYear, lastYear } = titlesFor(d.roll);
    if (years.length === 0) continue;
    out.push({ club: d.club, titles: years.length, years, firstYear, lastYear, href: null });
  }
  return out;
}

export type CrossSportRL = { count: number; years: string[]; href: string };

export function getBritishRLTitlesForClub(teamName: string): CrossSportRL | null {
  const rollName = CROSS_SPORT[teamName];
  if (!rollName) return null;
  const { years } = titlesFor(rollName);
  if (years.length === 0) return null;
  return { count: years.length, years, href: HUB };
}
