// Single source of truth for the cross-sport league catalog.
//
// Every league / portal hub that appears in the Sports navigation lives here as
// one entry. This file feeds the slim Sports dropdown (DesktopNav, marquee
// entries), the Sports group in MobileMenu, the /sports sidebar board
// (SportsConsole), and the /sports league directory. Adding a league is one
// entry here.
//
// `family` uses the CANONICAL sport names from the MetroAreas workbook Team List
// (American Football, Canadian Football, Hockey, Cricket, etc.), not invented
// umbrella terms, so the groupings match the rest of the site. Status is NOT
// stored here; it is derived at render time from lib/leagueStatus.

export type SportFamily =
  | "Football"
  | "Gridiron"
  | "Basketball"
  | "Baseball"
  | "Hockey"
  | "Cricket"
  | "Rugby Union"
  | "Rugby League"
  | "Aussie Rules"
  | "Handball"
  | "Volleyball"
  | "Olympics";

// Display order for family groupings across every surface.
export const FAMILY_ORDER: SportFamily[] = [
  "Olympics",
  "Football",
  "Gridiron",
  "Basketball",
  "Baseball",
  "Hockey",
  "Cricket",
  "Rugby Union",
  "Rugby League",
  "Aussie Rules",
  "Handball",
  "Volleyball",
];

export type LeagueScope = "club" | "international" | "college";

export type CatalogEntry = {
  href: string;
  /** Canonical label, e.g. "International Basketball". */
  label: string;
  /** Compact label for the /sports board, where the sport-group header already
   *  gives context (e.g. "International" under Basketball). Defaults to label. */
  boardLabel?: string;
  /** Human sport line shown under the label, e.g. "Basketball". */
  sport: string;
  family: SportFamily;
  scope: LeagueScope;
  /** Surfaced in the slim desktop dropdown shortcut. */
  marquee?: boolean;
  /** "coming" hubs render as disabled "Soon" cards and never link. */
  status?: "live" | "coming";
  /** Winners-only domestic roll (e.g. British Rugby League). Kept in the full
   *  directory but hidden from the compact /sports board. */
  subRoll?: boolean;
  /** Long description used by the mobile menu. */
  hint?: string;
};

export const SPORTS_CATALOG: CatalogEntry[] = [
  // Football (Soccer)
  { href: "/teams/football", label: "Club Football", boardLabel: "Club", sport: "Football", family: "Football", scope: "club", marquee: true, hint: "Top European league hubs plus the full English pyramid; canonical club pages and league hubs" },
  { href: "/teams/national", label: "International Football", boardLabel: "International", sport: "Football", family: "Football", scope: "international", marquee: true, hint: "National-team pages and tournament hubs: World Cup, continental cups, intercontinental tournaments" },
  { href: "/teams/wfootball", label: "Women's Club", boardLabel: "Women's Club", sport: "Football", family: "Football", scope: "club", hint: "Women's club football honours and finals: UWCL, FIFA Champions Cup, WSL, Women's FA Cup, Liga F, NWSL Championship and Shield" },
  { href: "/teams/wnational", label: "Women's International", boardLabel: "Women's Int'l", sport: "Football", family: "Football", scope: "international", hint: "Women's national-team honours: the World Cup, Olympic football, the UEFA Women's Euros, and the Finalissima." },

  // Gridiron (NFL + College Football + CFL)
  { href: "/teams/nfl", label: "NFL", sport: "American Football", family: "Gridiron", scope: "club", marquee: true, hint: "All 32 active franchises; defunct franchises link from inside" },
  { href: "/teams/cfb", label: "College Football", sport: "American Football", family: "Gridiron", scope: "college", marquee: true, hint: "FBS programs through history: national titles, conference championships, and greatest games by Game Score" },

  { href: "/teams/cfl", label: "CFL", sport: "Canadian Football", family: "Gridiron", scope: "club", hint: "Every CFL franchise, live standings, season records, and Grey Cup history since 1909" },

  // Basketball
  { href: "/teams/nba", label: "NBA", sport: "Basketball", family: "Basketball", scope: "club", marquee: true, hint: "All 30 active franchises; ABA cups in slate; live 2026 playoff status" },
  { href: "/teams/wnba", label: "WNBA", sport: "Basketball", family: "Basketball", scope: "club", hint: "Every WNBA franchise current and defunct, all-time records, champions since 1997" },
  { href: "/teams/basketball", label: "International Basketball", boardLabel: "International", sport: "Basketball", family: "Basketball", scope: "international", hint: "FIBA World Cup finals, every Olympic podium since 1936, and the EuroLeague club crown" },
  { href: "/teams/cbb", label: "Men's College Basketball", sport: "Basketball", family: "Basketball", scope: "college", status: "coming" },

  // Baseball
  { href: "/teams/mlb", label: "MLB", sport: "Baseball", family: "Baseball", scope: "club", marquee: true, hint: "All 30 active franchises; defunct franchises link from inside" },
  { href: "/teams/baseball", label: "International Baseball", boardLabel: "International", sport: "Baseball", family: "Baseball", scope: "international", hint: "The complete World Baseball Classic: every edition, game and final since 2006, all 23 nations" },

  // Hockey
  { href: "/teams/nhl", label: "NHL", sport: "Hockey", family: "Hockey", scope: "club", marquee: true, hint: "All 32 active franchises; Stanley Cups from 1910 in gold, WHA Avco in slate" },
  { href: "/teams/hockey", label: "International Ice Hockey", boardLabel: "International", sport: "Hockey", family: "Hockey", scope: "international", hint: "Olympic ice hockey (the ultimate trophy) since 1920, the Canada Cup / World Cup of Hockey, and the annual IIHF World Championship" },

  // Cricket
  { href: "/teams/cricket", label: "International Cricket", boardLabel: "International", sport: "Cricket", family: "Cricket", scope: "international", hint: "Every cricket international since 1877: our own recomputed rankings, number-one reigns, honours, and all 110 nations" },
  { href: "/teams/ipl", label: "IPL", sport: "Cricket", family: "Cricket", scope: "club", hint: "All 10 IPL franchises, season standings, playoffs, and finals history since 2008" },

  // Rugby Union
  { href: "/teams/rugby-union", label: "Rugby Union", sport: "Rugby Union", family: "Rugby Union", scope: "international", hint: "Test rugby since 1871: Six Nations, Rugby Championship, World Cup finals, and world rankings since 2003" },

  // Rugby League
  { href: "/teams/rugby-league", label: "International Rugby League", boardLabel: "International", sport: "Rugby League", family: "Rugby League", scope: "international", hint: "The Rugby League World Cup since 1954: 16 editions, every final, and the all-time national honour table." },
  { href: "/teams/nrl", label: "NRL", sport: "Rugby League", family: "Rugby League", scope: "club", hint: "Every NSWRL/NRL club since 1908, premierships, ladders, and the full Grand Final roll" },

  // Aussie Rules
  { href: "/teams/afl", label: "AFL", sport: "Aussie Rules", family: "Aussie Rules", scope: "club", hint: "Every VFL/AFL club since 1897, premierships, ladders, and the full Grand Final roll" },

  // Handball
  { href: "/teams/handball", label: "International Handball", boardLabel: "International", sport: "Handball", family: "Handball", scope: "international", hint: "Olympic men's handball (the ultimate trophy) and the IHF World Championship since 1938" },

  // Volleyball
  { href: "/teams/volleyball", label: "International Volleyball", boardLabel: "International", sport: "Volleyball", family: "Volleyball", scope: "international", hint: "Olympic men's volleyball (the ultimate trophy) since 1964 and the FIVB World Championship since 1949" },

  // Olympics (multi-sport portal; its own section)
  { href: "/teams/olympics", label: "Olympics", sport: "Olympics", family: "Olympics", scope: "international", hint: "Every Summer and Winter Games since 1896: all-time medal table with lineages folded into modern nations" },
];

// Helpers -------------------------------------------------------------------

/** Marquee hubs for the slim desktop dropdown shortcut. */
export const MARQUEE_HUBS: CatalogEntry[] = SPORTS_CATALOG.filter((e) => e.marquee);

export type FamilyGroup = { family: SportFamily; entries: CatalogEntry[] };

/**
 * Catalog grouped by family in FAMILY_ORDER. Pass includeComing=false to drop
 * not-yet-shipped hubs (the dropdown and the board); the directory keeps them
 * so the "Soon" cards still render.
 */
export function catalogByFamily(includeComing = true): FamilyGroup[] {
  const groups: FamilyGroup[] = [];
  for (const family of FAMILY_ORDER) {
    const entries = SPORTS_CATALOG.filter(
      (e) => e.family === family && (includeComing || e.status !== "coming"),
    );
    if (entries.length) groups.push({ family, entries });
  }
  return groups;
}

export function boardLabelFor(e: CatalogEntry): string {
  return e.boardLabel ?? e.label;
}
