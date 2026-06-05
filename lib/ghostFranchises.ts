import type { TeamLink } from "@/lib/teamLinks";

// Single source of truth for "Ghost Franchises" / The Geography of Erasure.
// Drives both the /sports/geography-of-erasure feature page and the small
// GhostFranchiseTag pill dropped into each featured team's hero. Keep this the
// only place the roster, the slugs, and the species taxonomy are defined.
//
// Three species of erasure:
//   true-death            franchise folded, legacy orphaned, no heir
//   relocation-laundering lineage survives but moved + renamed; slug points at
//                         the heir's live page (the erasure made literal)
//   living-exile          club still exists but is barred from the top tier
export type GhostSpecies = "true-death" | "relocation-laundering" | "living-exile";

export type GhostFranchise = {
  league: TeamLink["league"];
  slug: string;        // team-page slug (heir's slug for relocation-laundering)
  name: string;        // display name as featured in the piece
  metro: string;       // the market the legacy belonged to
  species: GhostSpecies;
  sport: string;       // short sport label for the card
  note: string;        // one-line editorial hook (qualitative, no hard figures)
  heir?: string;       // for relocation-laundering, who wears the legacy now
  pageComing?: boolean; // true when the team page is not live yet (no link)
};

export const GHOST_SPECIES: Record<
  GhostSpecies,
  { label: string; order: number; blurb: string }
> = {
  "true-death": {
    label: "True deaths",
    order: 0,
    blurb:
      "The franchise folded. The legacy is orphaned, with no heir to keep it alive. These champions exist now only in the record books.",
  },
  "relocation-laundering": {
    label: "Relocation laundering",
    order: 1,
    blurb:
      "The lineage survives, but it was moved and renamed. The trophies still count; they just hang in another metro's building. Follow the link and you land on the heir, not the original.",
  },
  "living-exile": {
    label: "Living in exile",
    order: 2,
    blurb:
      "The club still exists, intact, with its name and its ground. It simply lost the only thing the corporate game measures: its place at the top.",
  },
};

export const GHOST_FRANCHISES: GhostFranchise[] = [
  // --- True deaths -------------------------------------------------------
  {
    league: "mlb", slug: "grays", name: "Providence Grays", metro: "Providence",
    species: "true-death", sport: "Baseball",
    note: "A two-time champion out of a booming mill town, carried to its 1884 pennant by Old Hoss Radbourn before folding the next year.",
  },
  {
    league: "mlb", slug: "spiders", name: "Cleveland Spiders", metro: "Cleveland",
    species: "true-death", sport: "Baseball",
    note: "The purest victim of the syndicate era: stripped of its players to stock the owners' other club, then put out of its misery by contraction.",
  },
  {
    league: "mlb", slug: "orioles-1", name: "Baltimore Orioles (original NL)", metro: "Baltimore",
    species: "true-death", sport: "Baseball",
    note: "A genuine 1890s dynasty whose tactics other clubs copied for decades, dissolved by a league vote rather than a defeat.",
  },
  {
    league: "mlb", slug: "colonels", name: "Louisville Colonels", metro: "Louisville",
    species: "true-death", sport: "Baseball",
    note: "Honus Wagner's first major-league home, erased in the same 1899 contraction that cut the National League to eight.",
  },
  {
    league: "nfl", slug: "bulldogs-canton", name: "Canton Bulldogs", metro: "Canton",
    species: "true-death", sport: "Gridiron",
    note: "Jim Thorpe's back-to-back champions and the reason the Hall of Fame sits in Canton. The shrine stayed; the team did not.",
  },
  {
    league: "nfl", slug: "indians-akron", name: "Akron Pros", metro: "Akron",
    species: "true-death", sport: "Gridiron",
    note: "The league's first champions, with Fritz Pollard, one of the pro game's first Black players and its first Black head coach.",
  },
  {
    league: "nfl", slug: "bulldogs-boston", name: "Pottsville Maroons", metro: "Pottsville",
    species: "true-death", sport: "Gridiron",
    note: "Won the 1925 title on the field, then had it stripped over a territorial dispute. Our records flag that championship as stolen, not lost.",
  },
  {
    league: "nfl", slug: "yellow-jackets", name: "Frankford Yellow Jackets", metro: "Philadelphia",
    species: "true-death", sport: "Gridiron",
    note: "A real champion out of a Philadelphia suburb, pruned when the league turned to chase big metropolitan gates.",
  },
  {
    league: "nhl", slug: "senators-org", name: "Ottawa Senators (original)", metro: "Ottawa",
    species: "true-death", sport: "Hockey",
    note: "The sport's first great dynasty, distinct from the modern club that borrowed the name. A government town could not match the new big-market arenas.",
  },
  {
    league: "nhl", slug: "maroons", name: "Montreal Maroons", metro: "Montreal",
    species: "true-death", sport: "Hockey",
    note: "Two-time Cup winners built for the city's English-speaking fans, sacrificed when the Depression made a two-team metro impossible.",
  },
  {
    league: "nhl", slug: "winnipeg-victorias", name: "Winnipeg Victorias", metro: "Winnipeg",
    species: "true-death", sport: "Hockey",
    note: "Titans of western Canadian hockey and repeat challenge-era Cup champions, squeezed out as the elite leagues centralized in the east.",
  },
  {
    league: "nhl", slug: "metropolitans", name: "Seattle Metropolitans", metro: "Seattle",
    species: "true-death", sport: "Hockey",
    note: "The first United States club to win the Stanley Cup, a banner that lost its home entirely when their league dissolved.",
  },
  {
    league: "football", slug: "renton", name: "Renton", metro: "Vale of Leven",
    species: "true-death", sport: "Football",
    note: "A village side good enough in 1888 to call itself 'Champions of the World,' then left behind as the game financialized into the cities.",
  },
  {
    league: "football", slug: "wanderers-fc", name: "Wanderers F.C.", metro: "London",
    species: "true-death", sport: "Football", pageComing: true,
    note: "London's amateur gentlemen, winners of five of the first seven FA Cups, who chose to walk away rather than turn professional.",
  },
  // --- Relocation laundering --------------------------------------------
  {
    league: "nba", slug: "kings", name: "Rochester Royals", metro: "Rochester",
    species: "relocation-laundering", sport: "Basketball", heir: "Sacramento Kings",
    note: "Upstate New York's champions, who beat the Mikan Lakers to a title. The banner now hangs in California under a different name.",
  },
  {
    league: "nhl", slug: "red-wings", name: "Victoria Cougars", metro: "Victoria",
    species: "relocation-laundering", sport: "Hockey", heir: "Detroit Red Wings",
    note: "The last team from outside the modern NHL to win the Cup, in 1925. The players were sold east and the lineage became an Original Six pillar.",
  },
  // --- Living in exile ---------------------------------------------------
  {
    league: "football", slug: "preston-north-end", name: "Preston North End", metro: "Preston",
    species: "living-exile", sport: "Football",
    note: "The original Invincibles: first league title, first Double, a Scottish passing revolution. Not a force in the top flight for generations.",
  },
  {
    league: "football", slug: "huddersfield-town", name: "Huddersfield Town", metro: "Huddersfield",
    species: "living-exile", sport: "Football",
    note: "First English club to win three straight titles, built by Herbert Chapman before the London money took him and the dynasty came apart.",
  },
];

const _byKey = new Map<string, GhostFranchise>();
for (const g of GHOST_FRANCHISES) _byKey.set(`${g.league}:${g.slug}`, g);

// Look up a featured franchise by its team-page (league, slug). Returns
// undefined when the team is not in the roster, so callers (e.g. the hero tag)
// can render nothing unconditionally.
export function getGhostFranchise(
  league: TeamLink["league"],
  slug: string,
): GhostFranchise | undefined {
  return _byKey.get(`${league}:${slug}`);
}

export function ghostsBySpecies(species: GhostSpecies): GhostFranchise[] {
  return GHOST_FRANCHISES.filter((g) => g.species === species);
}

// /teams/<league>/<slug>, or null when the page is not live yet.
export function ghostTeamHref(g: GhostFranchise): string | null {
  return g.pageComing ? null : `/teams/${g.league}/${g.slug}`;
}
