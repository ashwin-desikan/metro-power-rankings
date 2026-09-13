import { LEAGUE_HUBS } from "./leagueHubs";

// The digest's sports taxonomy, shaped like the site's own hubs.
//
// Ashwin, 2026-09-13, across several passes:
//  * "match how we've set up the sports hubs, where we have club football, international
//    football, baseball, etc. You can have subcategories underneath it."
//  * "in season, it should include any league that has a listing in live standings ...
//    whether it has a hub or not." So this list is the STANDINGS BOARD's competitions,
//    not the league-hub registry's. NPB, the club rugby boards, the KHL, the WTC and the
//    confederation cups are all on that board and all belong here.
//  * "the sport name should link to the hub itself ... Anything that doesn't have a hub
//    should just be blank." Hence `href` is optional and rendered as plain text when absent.
//  * "order these by the most prominent ones." Array order IS the order, top to bottom.
//  * "use acronyms which are already known and are already used in live standings." So
//    `label` is the board's own name for a competition: NFL, not National Football League.
//  * "In club football, please separate the European competitions from the domestic
//    leagues ... continental competitions, because we want to include Copa Libertadores."
//
// Hrefs come from LEAGUE_HUBS by key where a hub exists, so a URL is never retyped here
// and the two cannot drift. Competitions with no hub carry no href at all.

export type SportGroup = { slug: string; label: string; href?: string; icon: string };

export type CompetitionSection = "continental" | "domestic" | "cup";

export type Competition = {
  slug: string;
  /** Display name, matching the live standings board. Acronym where the board uses one. */
  label: string;
  group: string;
  /** Club football only: continental competitions listed above domestic leagues. */
  section?: CompetitionSection;
  /**
   * A season-long knockout competition rather than a league.
   *
   * Ashwin, 2026-09-13: "one that's just playoffs, like the ones that are actually stage
   * playoffs. The other section can be the knockout section, which could be Champions
   * League, Champions Cup in rugby, the FA Cup, kind of these season-long knockout
   * competitions." These sit in their own bucket whenever they are running, at any stage,
   * which is also what stops the club football in-season list running to fifteen rows.
   */
  knockout?: boolean;
  href?: string;
  /** Months (1-12) the competition is running. Used only when leagueStatus has no entry. */
  months?: number[];
  /** Months it is in its playoffs or finals, checked before `months`. */
  playoffMonths?: number[];
  /**
   * What stage it is at, by month. Checked before `playoffMonths` and `months`.
   *
   * Ashwin, 2026-09-13: "you should kind of say Champions League league phase, Europa
   * League league phase". A knockout competition listed with no stage is just a name, and
   * the stage is the part that says whether it matters this week.
   *
   * 🔴 THESE ARE MONTH APPROXIMATIONS, in the same style and with the same caveat as the
   * month windows in lib/leagueStatus: good enough to say what part of the season we are
   * in, not a fixture list. Where lib/leagueStatus already carries a dated window for the
   * competition (the three UEFA cups, Copa Libertadores) that wins and these are ignored.
   */
  stages?: { months: number[]; label: string }[];
  /** [month, day] the season opens, for the "Starting soon" bucket. */
  startsOn?: [number, number];
  /** Extra spellings a story tag might use. */
  aliases?: string[];
  /**
   * The umbrella this competition is FILED UNDER in the digest, when one applies.
   *
   * Ashwin, 2026-09-13: "You could look for UEFA Champions League, Europa League, and
   * Conference League. All of those could be under the banner of UEFA. It would just show
   * UEFA as the tag itself, but underneath, you would be looking for all of those other
   * ones." Splitting one continental story across three tags of one each helps nobody;
   * one UEFA tag holding all of them is a filter a reader would actually use.
   *
   * This is a DIGEST-ONLY rollup. The season panel still reads COMPETITIONS directly, so
   * the Champions League and the Europa League keep their own rows and their own stages
   * there, which is what the panel was asked for.
   */
  umbrella?: string;
};

/**
 * A banner that several competitions, and the body that runs them, are filed under.
 *
 * Ashwin, 2026-09-13: "you can include not just the Champions League, but anything
 * associated with UEFA ... It could be the same for Conmebol and the Copa Libertadores."
 * So the umbrella is matched through its own name AND its members' names. An earlier pass
 * kept the bare word "UEFA" out of this and left the tag on one story out of a window that
 * held a dozen; the governing body IS the umbrella, which is the whole point of it.
 *
 * `needles` are the banner's own names, for the body itself and for anything under it that
 * has no competition entry of its own.
 */
export type Umbrella = {
  slug: string;
  label: string;
  group: string;
  href?: string;
  section?: CompetitionSection;
  needles?: string[];
};

export const UMBRELLAS: Umbrella[] = [
  {
    // Ashwin, 2026-09-13: "international football should represent the FIFA World Cup and
    // the club World Cup. Those types of stories should fall under World Cup, or you could
    // change it to FIFA ... they should all be around the same tag." FIFA is the name that
    // holds all of it: the tournament, the Club World Cup, the stake sale, the presidency.
    // Infantino is in the needles because the archive carries stories that name only him;
    // it is a needle, not a principle, and it changes when the presidency does.
    slug: "fifa",
    label: "FIFA",
    group: "international-football",
    href: "/teams/national",
    needles: ["FIFA", "Infantino", "Club World Cup"],
  },
  {
    slug: "uefa",
    label: "UEFA",
    group: "club-football",
    section: "continental",
    href: "/teams/football/tournaments/champions-league",
    needles: ["UEFA", "UEFA Super Cup"],
  },
  {
    slug: "conmebol",
    label: "CONMEBOL",
    group: "club-football",
    section: "continental",
    href: "/teams/football/tournaments/copa-libertadores",
    needles: ["CONMEBOL", "Copa Sudamericana", "Recopa Sudamericana"],
  },
  {
    // CONCACAF's own competitions are mostly international (the Gold Cup), and in this
    // archive the name appears in World Cup governance, so it sits with international
    // football rather than with the club game.
    slug: "concacaf",
    label: "CONCACAF",
    group: "international-football",
    href: "/teams/national",
    needles: ["CONCACAF", "Gold Cup", "Leagues Cup"],
  },
];

// Prominence order, most prominent first. This is the order the panel and the rail read.
export const SPORT_GROUPS: SportGroup[] = [
  { slug: "club-football", label: "Club Football", href: "/teams/football", icon: "⚽" },
  { slug: "american-football", label: "American Football", href: "/teams/nfl", icon: "🏈" },
  { slug: "basketball", label: "Basketball", href: "/teams/basketball", icon: "🏀" },
  { slug: "baseball", label: "Baseball", href: "/teams/baseball", icon: "⚾" },
  { slug: "international-football", label: "International Football", href: "/teams/national", icon: "⚽" },
  { slug: "ice-hockey", label: "Ice Hockey", href: "/teams/hockey", icon: "🏒" },
  { slug: "womens-football", label: "Women's Football", href: "/teams/wfootball", icon: "⚽" },
  { slug: "cricket", label: "Cricket", href: "/teams/cricket", icon: "🏏" },
  { slug: "motorsport", label: "Motorsport", href: "/teams/f1", icon: "🏎️" },
  { slug: "rugby-union", label: "Rugby Union", href: "/teams/rugby-union", icon: "🏉" },
  { slug: "rugby-league", label: "Rugby League", href: "/teams/rugby-league", icon: "🏉" },
  { slug: "tennis", label: "Tennis", href: "/teams/tennis", icon: "🎾" },
  { slug: "golf", label: "Golf", href: "/teams/golf", icon: "⛳" },
  { slug: "australian-rules", label: "Australian Rules", href: "/teams/afl", icon: "🏉" },
  { slug: "volleyball", label: "Volleyball", href: "/teams/volleyball", icon: "🏐" },
  { slug: "handball", label: "Handball", href: "/teams/handball", icon: "🤾" },
  { slug: "olympics", label: "Olympics", href: "/teams/olympics", icon: "🏅" },
];

const HUB_HREF = new Map(LEAGUE_HUBS.map((h) => [h.key, h.href]));
/** The hub URL for a LEAGUE_HUBS key, or undefined when we have no such hub. */
const hub = (key: string) => HUB_HREF.get(key);

// Every competition the live standings board carries, in prominence order within its
// sport. `months` is only consulted when lib/leagueStatus has no curated entry for the
// href, so a competition the rest of the site already tracks keeps one source of truth.
export const COMPETITIONS: Competition[] = [
  // --- Club football: continental first, then domestic --------------------
  // The three UEFA club cups file under one "UEFA" tag in the digest and keep their own
  // rows, stages and hubs everywhere else. See `umbrella` on the Competition type.
  { slug: "champions-league", label: "Champions League", group: "club-football", section: "continental", knockout: true,
    href: "/teams/football/tournaments/champions-league", umbrella: "uefa",
    aliases: ["UEFA Champions League"] },
  { slug: "europa-league", label: "Europa League", group: "club-football", section: "continental", knockout: true,
    href: "/teams/football/tournaments/europa-league", umbrella: "uefa",
    aliases: ["UEFA Europa League"] },
  { slug: "conference-league", label: "Conference League", group: "club-football", section: "continental", knockout: true,
    href: "/teams/football/tournaments/conference-league", umbrella: "uefa",
    aliases: ["UEFA Conference League", "Europa Conference League"] },
  { slug: "copa-libertadores", label: "Copa Libertadores", group: "club-football", section: "continental", knockout: true,
    href: "/teams/football/tournaments/copa-libertadores", umbrella: "conmebol",
    aliases: ["Libertadores", "CONMEBOL Libertadores"] },
  // The other confederations' club cups joined the board on 2026-09-13. No tournament
  // page of their own yet, so no href: they render as plain text until one exists.
  { slug: "afc-champions-league", label: "AFC Champions League Elite", group: "club-football",
    section: "continental", knockout: true, months: [9, 10, 11, 12, 1, 2, 3, 4, 5],
    stages: [{ months: [9, 10, 11, 12], label: "League stage" },
             { months: [2, 3], label: "Knockouts" },
             { months: [4, 5], label: "Finals" }],
    aliases: ["AFC Champions League"] },
  { slug: "caf-champions-league", label: "CAF Champions League", group: "club-football",
    section: "continental", knockout: true, months: [9, 10, 11, 12, 1, 2, 3, 4, 5],
    stages: [{ months: [9, 10, 11, 12, 1], label: "Group stage" },
             { months: [2, 3, 4], label: "Knockouts" },
             { months: [5], label: "Final" }] },
  { slug: "premier-league", label: "Premier League", group: "club-football", section: "domestic",
    href: hub("premier-league"), aliases: ["EPL"] },
  { slug: "la-liga", label: "La Liga", group: "club-football", section: "domestic", href: hub("la-liga") },
  { slug: "serie-a", label: "Serie A", group: "club-football", section: "domestic", href: hub("serie-a") },
  { slug: "bundesliga", label: "Bundesliga", group: "club-football", section: "domestic", href: hub("bundesliga"), aliases: ["BL"] },
  { slug: "ligue-1", label: "Ligue 1", group: "club-football", section: "domestic", href: hub("ligue-1") },
  { slug: "eredivisie", label: "Eredivisie", group: "club-football", section: "domestic", href: hub("eredivisie") },
  { slug: "primeira-liga", label: "Primeira Liga", group: "club-football", section: "domestic", href: hub("primeira-liga"), aliases: ["Liga PT"] },
  { slug: "scottish-premiership", label: "Scottish Premiership", group: "club-football", section: "domestic", href: hub("scottish-premiership"), aliases: ["SPFL"] },
  { slug: "mls", label: "MLS", group: "club-football", section: "domestic", href: hub("mls"), aliases: ["Major League Soccer"] },
  // Ashwin, 2026-09-13: "you can also include the FA Cup and League Cup there too." Both
  // are domestic but knockout, so they get their own section in the rail and sit with the
  // continental cups in the panel. /teams/football/cups is the hub for both.
  { slug: "fa-cup", label: "FA Cup", group: "club-football", section: "cup", knockout: true,
    href: "/teams/football/cups", months: [11, 12, 1, 2, 3, 4, 5],
    stages: [{ months: [11, 12], label: "Early rounds" },
             { months: [1, 2], label: "Third and fourth rounds" },
             { months: [3], label: "Quarter-finals" },
             { months: [4], label: "Semi-finals" },
             { months: [5], label: "Final" }] },
  { slug: "league-cup", label: "League Cup", group: "club-football", section: "cup", knockout: true,
    href: "/teams/football/cups", months: [8, 9, 10, 11, 12, 1, 2],
    stages: [{ months: [8, 9, 10], label: "Early rounds" },
             { months: [11, 12], label: "Later rounds" },
             { months: [1], label: "Semi-finals" },
             { months: [2], label: "Final" }],
    aliases: ["EFL Cup", "Carabao Cup"] },

  // --- American football ---------------------------------------------------
  // Ashwin, 2026-09-13: "for any of the other American sports as well ... if they have
  // different names or go by acronyms and full names, you should have meta tags associated
  // with those." So the showpiece each league is known by counts as the league: a story
  // about the Super Bowl is an NFL story whether or not it says NFL.
  { slug: "nfl", label: "NFL", group: "american-football", href: hub("nfl"),
    aliases: ["National Football League", "Super Bowl"] },
  { slug: "cfb", label: "CFB", group: "american-football", href: hub("cfb"),
    aliases: ["College Football", "College Football (FBS)", "College Football Playoff", "CFP"] },
  { slug: "cfl", label: "CFL", group: "american-football", href: hub("cfl"), aliases: ["Canadian Football League", "Grey Cup"] },

  // --- Basketball ----------------------------------------------------------
  { slug: "nba", label: "NBA", group: "basketball", href: hub("nba"),
    aliases: ["National Basketball Association", "NBA Finals"] },
  { slug: "wnba", label: "WNBA", group: "basketball", href: hub("wnba"),
    aliases: ["Women's National Basketball Association"] },
  // Both college seasons open 1 Nov 2026 and run to the title games on 5 and 4 Apr 2027
  // (Wikipedia, 2026-27 NCAA Division I men's/women's basketball season, read 2026-09-13).
  { slug: "cbb", label: "CBB", group: "basketball", href: hub("cbb"), startsOn: [11, 1],
    aliases: ["College Basketball", "College Basketball (NCAA D-I)", "NCAA basketball",
              "March Madness", "NCAA Tournament"] },
  { slug: "cbb-w", label: "CBB (W)", group: "basketball", href: "/teams/cbb-w", startsOn: [11, 1],
    months: [11, 12, 1, 2], playoffMonths: [3, 4], aliases: ["Women's College Basketball"] },
  // Ashwin, 2026-09-13: "when the EuroLeague starts, it should also be in the knockout
  // area because it'll be the league phase first, then the regular knockouts." Same shape
  // as the UEFA cups. Until it starts it sits in Starting soon like anything else, because
  // the knockout flag decides which bucket a RUNNING competition goes to, nothing else.
  { slug: "euroleague", label: "EuroLeague", group: "basketball", href: hub("euroleague"),
    knockout: true, months: [10, 11, 12, 1, 2, 3, 4], playoffMonths: [5], startsOn: [9, 30],
    stages: [{ months: [10, 11, 12, 1, 2, 3], label: "League phase" },
             { months: [4], label: "Play-ins and playoffs" },
             { months: [5], label: "Final Four" }] },
  { slug: "cba", label: "CBA", group: "basketball", href: hub("basketball-domestic"),
    months: [10, 11, 12, 1, 2, 3], playoffMonths: [4, 5], aliases: ["Chinese Basketball Association"] },

  // --- Baseball ------------------------------------------------------------
  { slug: "mlb", label: "MLB", group: "baseball", href: hub("mlb"),
    aliases: ["Major League Baseball", "World Series"] },
  { slug: "npb", label: "NPB", group: "baseball", href: hub("npb"),
    months: [3, 4, 5, 6, 7, 8, 9], playoffMonths: [10, 11], aliases: ["Nippon Professional Baseball"] },

  // --- International football ----------------------------------------------
  { slug: "world-cup", label: "World Cup", group: "international-football", href: "/teams/national",
    umbrella: "fifa" },
  { slug: "nations-league", label: "Nations League", group: "international-football", href: "/teams/national",
    months: [9, 10, 11, 3, 6], aliases: ["UEFA Nations League"] },
  { slug: "euros", label: "Euros", group: "international-football", href: "/teams/national",
    aliases: ["European Championship", "Euro 2028"] },
  { slug: "asian-cup", label: "Asian Cup", group: "international-football",
    months: [1], aliases: ["AFC Asian Cup"] },

  // --- Ice hockey ----------------------------------------------------------
  { slug: "nhl", label: "NHL", group: "ice-hockey", href: hub("nhl"),
    aliases: ["National Hockey League", "Stanley Cup"] },
  { slug: "khl", label: "KHL", group: "ice-hockey", href: hub("hockey-domestic"),
    months: [9, 10, 11, 12, 1, 2], playoffMonths: [3, 4], aliases: ["Gagarin Cup"] },

  // --- Women's football ----------------------------------------------------
  // The women's league hubs carry no entry in lib/leagueStatus, so these months are the
  // only thing that puts them on the panel. Without them the whole group vanished.
  { slug: "wsl", label: "WSL", group: "womens-football", href: hub("wsl"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5], aliases: ["Women's Super League", "FA WSL"] },
  { slug: "nwsl", label: "NWSL", group: "womens-football", href: hub("nwsl"),
    months: [3, 4, 5, 6, 7, 8, 9, 10], playoffMonths: [11] },
  { slug: "liga-f", label: "Liga F", group: "womens-football", href: hub("liga-f"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5] },
  { slug: "uwcl", label: "UWCL", group: "womens-football", href: "/teams/wfootball", knockout: true,
    months: [9, 10, 11, 12, 1, 2, 3], playoffMonths: [4, 5],
    stages: [{ months: [9, 10, 11, 12], label: "League phase" },
             { months: [1, 2], label: "League phase" },
             { months: [3, 4], label: "Knockouts" },
             { months: [5], label: "Final" }],
    aliases: ["Women's Champions League", "UEFA Women's Champions League"] },
  { slug: "womens-world-cup", label: "Women's World Cup", group: "womens-football",
    href: "/teams/national/womens-world-cup" },

  // --- Cricket -------------------------------------------------------------
  { slug: "wtc", label: "WTC", group: "cricket", href: "/teams/cricket",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], aliases: ["World Test Championship"] },
  { slug: "ipl", label: "IPL", group: "cricket", href: hub("ipl"), aliases: ["Indian Premier League"] },
  { slug: "t20-leagues", label: "Domestic T20", group: "cricket", href: hub("t20-leagues"),
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], aliases: ["T20"] },
  { slug: "county-championship", label: "County Championship", group: "cricket", href: hub("county-championship"),
    months: [4, 5, 6, 7, 8, 9], aliases: ["County"] },

  // --- Motorsport ----------------------------------------------------------
  { slug: "formula-1", label: "F1", group: "motorsport", href: hub("f1") ?? "/teams/f1", aliases: ["Formula 1", "Formula One"] },

  // --- Rugby union ---------------------------------------------------------
  { slug: "champions-cup", label: "Champions Cup", group: "rugby-union", href: hub("rugby-clubs"), knockout: true,
    months: [12, 1, 4], playoffMonths: [5],
    stages: [{ months: [12, 1], label: "Pool stage" },
             { months: [4], label: "Knockouts" },
             { months: [5], label: "Final" }], aliases: ["Heineken Champions Cup"] },
  { slug: "top-14", label: "Top 14", group: "rugby-union", href: hub("rugby-clubs"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5], playoffMonths: [6], aliases: ["Top14"] },
  { slug: "premiership-rugby", label: "Premiership", group: "rugby-union", href: hub("rugby-clubs"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5], playoffMonths: [6], aliases: ["Premiership Rugby"] },
  { slug: "urc", label: "URC", group: "rugby-union", href: hub("rugby-clubs"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5], playoffMonths: [6], aliases: ["United Rugby Championship"] },
  { slug: "super-rugby", label: "Super Rugby", group: "rugby-union", href: hub("rugby-clubs"),
    months: [2, 3, 4, 5], playoffMonths: [6] },

  // --- Rugby league --------------------------------------------------------
  { slug: "nrl", label: "NRL", group: "rugby-league", href: hub("nrl"), aliases: ["National Rugby League"] },
  { slug: "super-league", label: "Super League", group: "rugby-league", href: hub("rugby-league"),
    months: [2, 3, 4, 5, 6, 7, 8], playoffMonths: [9, 10] },

  // --- The rest ------------------------------------------------------------
  // Ashwin, 2026-09-13: "move the tennis and golf majors to the knockout stage area."
  // They only appear at all while a major is being played, and a major is a knockout.
  { slug: "tennis-slams", label: "Tennis majors", group: "tennis", href: "/teams/tennis", knockout: true },
  { slug: "golf-majors", label: "Golf majors", group: "golf", href: "/teams/golf", knockout: true },
  { slug: "afl", label: "AFL", group: "australian-rules", href: hub("afl"), aliases: ["Australian Football League"] },
  { slug: "superlega", label: "SuperLega", group: "volleyball", href: hub("volleyball-domestic"),
    months: [10, 11, 12, 1, 2, 3], playoffMonths: [4], aliases: ["Italian Volleyball League"] },
  { slug: "plusliga", label: "PlusLiga", group: "volleyball", href: hub("volleyball-domestic"),
    months: [9, 10, 11, 12, 1, 2, 3], playoffMonths: [4] },
  { slug: "handball-bundesliga", label: "HBL", group: "handball", href: hub("handball-domestic"),
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6], aliases: ["Handball-Bundesliga"] },
  { slug: "summer-olympics", label: "Olympics", group: "olympics", href: "/teams/olympics" },
];

export const GROUP_BY_SLUG = new Map(SPORT_GROUPS.map((g) => [g.slug, g]));
export const COMPETITION_BY_SLUG = new Map(COMPETITIONS.map((c) => [c.slug, c]));
export const UMBRELLA_BY_SLUG = new Map(UMBRELLAS.map((u) => [u.slug, u]));

/** What the digest calls a competition: its umbrella when it has one, itself otherwise. */
export function displaySlug(slug: string): string {
  return COMPETITION_BY_SLUG.get(slug)?.umbrella ?? slug;
}

/** A competition or an umbrella, whichever the slug names, in one shape. */
export type DisplayCompetition = {
  slug: string;
  label: string;
  group: string;
  href?: string;
  section?: CompetitionSection;
};

export function displayCompetition(slug: string): DisplayCompetition | null {
  const u = UMBRELLA_BY_SLUG.get(slug);
  if (u) return { slug: u.slug, label: u.label, group: u.group, href: u.href, section: u.section };
  const c = COMPETITION_BY_SLUG.get(slug);
  if (!c) return null;
  return { slug: c.slug, label: c.label, group: c.group, href: c.href, section: c.section };
}

/**
 * Every competition the digest can show, in COMPETITIONS order, with each umbrella taking
 * the position of its first member and its members dropped. The rail renders this list, so
 * "UEFA" appears exactly where the Champions League used to and the continental cups stay
 * above the domestic leagues.
 */
export const DISPLAY_COMPETITIONS: DisplayCompetition[] = (() => {
  const out: DisplayCompetition[] = [];
  const seen = new Set<string>();
  for (const c of COMPETITIONS) {
    const slug = c.umbrella ?? c.slug;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const d = displayCompetition(slug);
    if (d) out.push(d);
  }
  return out;
})();

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

/**
 * Every spelling that resolves to a competition: its label, its slug and its aliases.
 * Built once; the first entry to claim a spelling keeps it, so COMPETITIONS order decides
 * a collision rather than whichever alias happened to be typed last.
 */
const BY_NAME: Map<string, Competition> = (() => {
  const m = new Map<string, Competition>();
  for (const c of COMPETITIONS) {
    for (const name of [c.label, c.slug, ...(c.aliases ?? [])]) {
      const k = norm(name);
      if (k && !m.has(k)) m.set(k, c);
    }
  }
  return m;
})();

/** The competition a story's league tag refers to, or null if we do not carry it. */
export function competitionForTag(tagLabel: string): Competition | null {
  return BY_NAME.get(norm(tagLabel)) ?? null;
}
