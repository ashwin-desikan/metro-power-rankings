import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveTeamLink } from "./teamLinks";
import { getAllClubs, getFootballClubByName } from "./football";

// Fan Attention Index. Source data is built entirely from Wikimedia
// Pageviews (agent=user, human traffic only), Google Trends and Wikidata
// sitelinks, by scripts/fans/build_fan_index.py, converted to JSON by
// scripts/fans/csv_to_json.py, and read here from
// public/data/fans/fan-attention.json. No external popularity survey is
// used anywhere in this pipeline. Reddit is part of the design (see the
// methodology page) but has no live data yet, so every team's `signal` is
// currently "wiki only" or "blend" (Wikipedia + Trends).

// v0.3.1 contract. Kept as `string` rather than a union: new groups/leagues
// can land in the JSON before this file is touched, and a page that only
// recognises a hardcoded list of groups is exactly the kind of thing that
// silently drops a row. Anything that DOES need to special-case a group
// (sport routing, the Football and Women's football sub-filters, the
// no-team-page groups) does so defensively.
export type FanIndexGroup = string;

type RawTeamV03 = {
  team: string;
  group: FanIndexGroup;
  league: string;
  conference: string | null;
  category: string;
  display_name: string | null;
  qid: string;
  en_title: string;
  wiki_baseline_12m: number;
  fan_index_raw: number;
  score_in_group: number;
  rank_in_group: number;
  rank_in_league: number;
  global_score: number;
  global_rank: number;
  in_flux: string | null;
  signal: string;
  inclusion_rule: string | null;
  spike_ratio: number;
  monthly: (number | null)[];
  value_m: number | null;
  val_source: string | null;
  val_year: number | null;
  residual_pct: number | null;
  value_per_1k_baseline: number | null;
};

// v0.1 shape, kept only so a stale/rolled-back JSON still renders something
// sane instead of a crash. All the later-version-only fields fall back to a
// value that degrades gracefully (global ranking becomes within-group
// ranking, category falls back to "World", in_flux is assumed unknown).
type RawTeamV01 = {
  team: string;
  group: string;
  league: string;
  val_league?: string;
  qid: string;
  en_title: string;
  baseline_12m: number;
  spike_ratio: number;
  attention_score: number;
  rank_in_group: number;
  monthly: (number | null)[];
  value_m: number | null;
  val_source: string | null;
  val_year: number | null;
  residual_pct: number | null;
  value_per_1k_baseline: number | null;
};

type RawTeam = Partial<RawTeamV03> & Partial<RawTeamV01> & { team: string; group: string; league: string; qid: string; en_title: string };

type RawFile = {
  generated: string;
  window: { start: string; end: string };
  version: string;
  method_url: string;
  groups: string[];
  residual_eligible_groups?: string[];
  teams: RawTeam[];
};

export type FanTeamRow = {
  team: string;
  group: string;
  league: string;
  conference: string | null;
  category: string;
  qid: string;
  en_title: string;
  wikiBaseline12m: number;
  fanIndexRaw: number;
  scoreInGroup: number;
  rankInGroup: number;
  rankInLeague: number;
  globalScore: number;
  globalRank: number;
  inFlux: string | null;
  signal: string;
  inclusionRule: string | null;
  spikeRatio: number;
  monthly: (number | null)[];
  valueM: number | null;
  valSource: string | null;
  valYear: number | null;
  residualPct: number | null;
  valuePer1kBaseline: number | null;
  residualEligible: boolean;
  /** Canonical /teams page, when the site has one for this team. */
  href: string | null;
  /** Canonical display name (the repo's own team-registry name when linked, else the fan-index name / disambiguated display_name). */
  displayName: string;
};

export type FanIndexData = {
  generated: string;
  window: { start: string; end: string };
  version: string;
  methodUrl: string;
  groups: string[];
  residualEligibleGroups: Set<string>;
  teams: FanTeamRow[];
};

// Spike threshold for the "event-driven spike" marker. Matches the README's
// framing of spike_ratio (max month / median month); 2.5x a typical month is
// the line between "a good month" and "something happened".
export const SPIKE_THRESHOLD = 2.5;

// Fallback, only used when the JSON predates residual_eligible_groups.
const DEFAULT_RESIDUAL_ELIGIBLE_GROUPS = ["European football", "Football", "MLB", "NBA", "NFL"];

// Football leagues that are European clubs vs. the two North American ones,
// for the "All football / MLS / Liga MX / <European league>" chip row.
export const FOOTBALL_LEAGUES = [
  "Premier League", "Championship", "La Liga", "Bundesliga", "Serie A",
  "Ligue 1", "Primeira Liga", "Eredivisie", "Süper Lig", "MLS", "Liga MX",
];

// The two leagues inside the "Women's football" group, for its league
// sub-filter chips.
export const WOMENS_FOOTBALL_LEAGUES = ["NWSL", "WSL"];

// The six groups shown under the "Major American sports" tab, in display
// order. Matches category === "Major American sports" in the JSON.
export const MAJOR_AMERICAN_GROUPS = [
  "NFL", "NBA", "MLB", "NHL", "College football", "College basketball",
];

// WNBA and Women's football (NWSL + WSL), shown under their own
// "Women's sports" tab. Matches category === "Women's sports" in the JSON.
export const WOMENS_SPORTS_GROUPS = ["WNBA", "Women's football"];

// Every remaining group, shown under the "World" tab. Matches
// category === "World" in the JSON.
export const WORLD_GROUPS = [
  "F1", "EuroLeague", "AFL", "NRL", "IPL",
  "NPB", "CFL", "Top 14", "Handball-Bundesliga", "SuperLega",
];

// ---------------------------------------------------------------------
// Canonical name + team-page linking
// ---------------------------------------------------------------------
//
// Why this exists: resolveTeamLink() (lib/teamLinks.ts) matches on an EXACT
// team name (case-insensitive), keyed to what each league's own dataset
// calls itself. The fan index's `team` field is mostly that same short
// name (it was built to line up with valuations.json, which most of these
// resolvers already serve), so most groups resolve at or near 100% with no
// extra work. The structural exceptions:
//
// 1. Football. The fan index's `team` is sometimes the Wikipedia article
//    title with a legal suffix ("Arsenal F.C.", "Arsenal" is the site's
//    canonical name), which getFootballClubByName()'s name-normaliser does
//    not always collapse onto the site's slug-lookup. The fix used here is
//    to join on Wikidata QID first (public/data/football/index.json carries
//    `wikidata_qid` for 174 of 1,449 clubs, an exact, spelling-proof key),
//    then fall back to the name lookup, then a small manual alias list for
//    the handful of remaining spelling drifts. A few clubs in the fan index
//    (Querétaro FC, FC Juárez, Galatasaray SK) are not in the site's
//    football database at all yet; those stay unlinked, not a resolver bug.
// 2. Women's football (NWSL + WSL). Routed through the site's dedicated
//    women's-football club database (lib/wfootball.ts), which only carries
//    a page for clubs with at least one honour on record, so a handful of
//    non-decorated current clubs legitimately have no page. This is the
//    ONLY path that can produce a women's-team link; it can never resolve to
//    a men's club page, so there is no risk of a women's team linking to the
//    wrong (men's) club.
// 3. College football / College basketball. The fan index's `team` is
//    sometimes a full mascot name ("Navy Midshipmen football", "Memphis
//    Tigers") where the site's CFB/CBB registries key on the short school
//    name alone ("Navy", "Memphis"). A curated alias table below covers the
//    teams (mostly the newly-added inclusion-rule programs) where the
//    mascot-name form does not already collapse onto the registry.
// 4. EuroLeague, Top 14, Handball-Bundesliga and SuperLega. The site has no
//    per-club page for any of these leagues (their hub pages link a club's
//    METRO page instead, not a team page), so every team in these four
//    groups is always unlinked here; that is a real gap in the site, not
//    something this page can paper over with a wrong link.
const FOOTBALL_NAME_ALIASES: Record<string, string> = {
  // Fan-index name normalises to "atletico san luis"; the site's club is
  // filed as plain "San Luis" (slug san-luis).
  "Atlético San Luis": "San Luis",
};

// Groups with no per-club page on the site at all (see point 4 above).
const NO_LINK_GROUPS = new Set(["EuroLeague", "Top 14", "Handball-Bundesliga", "SuperLega"]);

// (group) -> [sport, leagueHint] passed to resolveTeamLink(). Football and
// Women's football are handled separately (see resolveCanonical below).
const GROUP_SPORT: Record<string, [string, string]> = {
  NFL: ["NFL", ""],
  NBA: ["NBA", ""],
  MLB: ["MLB", ""],
  NHL: ["NHL", ""],
  "College football": ["CFB", ""],
  "College basketball": ["College Basketball", "NCAA"],
  AFL: ["AFL", ""],
  NRL: ["NRL", ""],
  IPL: ["IPL", ""],
  F1: ["F1", ""],
  WNBA: ["WNBA", ""],
  // NPB clubs share the "Baseball" sport label with MLB; resolveTeamLink's
  // isMlb branch tries an MLB franchise first, then falls back to NPB, so
  // routing NPB rows through the same sport label is correct, not a bug.
  NPB: ["Baseball", ""],
  CFL: ["Canadian Football", ""],
};

// Team-specific name overrides applied before resolveTeamLink, for the rare
// case where the fan index's name is a historical/alternate name the site's
// resolver does not carry as an alias. Keyed "group::team".
const NAME_OVERRIDES: Record<string, string> = {
  // Renamed "Seattle Reign FC" in the site's women's-football data; the fan
  // index (and Wikipedia) still carry the team under its prior name.
  "Women's football::OL Reign": "Seattle Reign FC",
};

// College football rows where the fan index's mascot-name form does not
// collapse onto the CFB registry's short school name. Almost all of these
// are the newly-added inclusion-rule programs (service academies, Group of
// Five teams added by the major-conference-adjacent rule).
const CFB_NAME_ALIASES: Record<string, string> = {
  "Navy Midshipmen football": "Navy",
  "Boise State Broncos football": "Boise State",
  "Boise State Broncos": "Boise State",
  "Army Black Knights football": "Army",
  "UNLV Rebels football": "UNLV",
  "Memphis Tigers football": "Memphis",
  "Troy Trojans football": "Troy",
  "Fresno State Bulldogs football": "Fresno State",
  "Buffalo Bulls football": "Buffalo",
  "San Diego State Aztecs football": "San Diego State",
  "Louisiana Ragin Cajuns football": "LA-Lafayette",
  "Ball State Cardinals football": "Ball State",
  "San Jose State Spartans football": "San Jose State",
  "Utah State Aggies football": "Utah State",
  "Tulane Green Wave": "Tulane",
  "Coastal Carolina Chanticleers": "Coastal Carolina",
  "Liberty Flames": "Liberty",
};

// Same idea for college basketball: a handful of teams (mostly the
// inclusion-rule additions) use a full name or short branding the CBB
// registry does not carry under that exact string.
const CBB_NAME_ALIASES: Record<string, string> = {
  "Saint Mary's": "St. Mary's",
  "VCU": "Virginia Commonwealth",
  "Memphis Tigers": "Memphis",
  "Colorado State Rams": "Colorado State",
  "Dayton Flyers": "Dayton",
};

let _footballByQid: Map<string, { slug: string; cur_name: string }> | null = null;
function footballByQid(): Map<string, { slug: string; cur_name: string }> {
  if (!_footballByQid) {
    _footballByQid = new Map();
    for (const c of getAllClubs()) {
      if (c.wikidata_qid) _footballByQid.set(c.wikidata_qid, c);
    }
  }
  return _footballByQid;
}

function resolveCanonical(t: { group: string; team: string; qid: string; rawDisplayName: string | null }): { href: string | null; displayName: string } {
  const fallbackName = t.rawDisplayName ?? t.team;

  if (NO_LINK_GROUPS.has(t.group)) {
    return { href: null, displayName: fallbackName };
  }

  if (t.group === "Football") {
    const byQid = t.qid ? footballByQid().get(t.qid) : undefined;
    const club = byQid ?? getFootballClubByName(FOOTBALL_NAME_ALIASES[t.team] ?? t.team);
    if (club) return { href: `/teams/football/${club.slug}`, displayName: club.cur_name };
    return { href: null, displayName: fallbackName };
  }

  if (t.group === "Women's football") {
    const nameToUse = NAME_OVERRIDES[`Women's football::${t.team}`] ?? fallbackName;
    const link = resolveTeamLink("W Football", nameToUse, "");
    if (link) return { href: link.href, displayName: link.displayName };
    return { href: null, displayName: fallbackName };
  }

  if (t.group === "College football" || t.group === "College basketball") {
    const aliasMap = t.group === "College football" ? CFB_NAME_ALIASES : CBB_NAME_ALIASES;
    const nameToUse = aliasMap[t.team] ?? t.team;
    const pair = GROUP_SPORT[t.group];
    const link = resolveTeamLink(pair[0], nameToUse, pair[1]);
    if (link) return { href: link.href, displayName: link.displayName };
    return { href: null, displayName: fallbackName };
  }

  const pair = GROUP_SPORT[t.group];
  if (!pair) return { href: null, displayName: fallbackName };
  const nameToUse = NAME_OVERRIDES[`${t.group}::${t.team}`] ?? t.team;
  const link = resolveTeamLink(pair[0], nameToUse, pair[1]);
  if (link) return { href: link.href, displayName: link.displayName };
  return { href: null, displayName: fallbackName };
}

let _data: FanIndexData | null = null;

export function getFanIndex(): FanIndexData {
  if (_data) return _data;
  const file = join(process.cwd(), "public", "data", "fans", "fan-attention.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as RawFile;
  const residualEligibleGroups = new Set(raw.residual_eligible_groups ?? DEFAULT_RESIDUAL_ELIGIBLE_GROUPS);

  const teams: FanTeamRow[] = raw.teams.map((t) => {
    const { href, displayName } = resolveCanonical({ group: t.group, team: t.team, qid: t.qid, rawDisplayName: t.display_name ?? null });
    const wikiBaseline = t.wiki_baseline_12m ?? t.baseline_12m ?? 0;
    const scoreInGroup = t.score_in_group ?? t.attention_score ?? 0;
    return {
      team: t.team,
      group: t.group,
      league: t.league,
      conference: t.conference ?? null,
      category: t.category ?? "World",
      qid: t.qid,
      en_title: t.en_title,
      wikiBaseline12m: wikiBaseline,
      fanIndexRaw: t.fan_index_raw ?? wikiBaseline,
      scoreInGroup,
      rankInGroup: t.rank_in_group ?? 0,
      rankInLeague: t.rank_in_league ?? t.rank_in_group ?? 0,
      // No true cross-group score exists in the v0.1 shape; the within-group
      // score is the closest honest fallback (documented in the type above).
      globalScore: t.global_score ?? scoreInGroup,
      globalRank: t.global_rank ?? 0,
      inFlux: t.in_flux ?? null,
      signal: t.signal ?? "wiki only",
      inclusionRule: t.inclusion_rule ?? null,
      spikeRatio: t.spike_ratio ?? 0,
      monthly: t.monthly ?? [],
      valueM: t.value_m ?? null,
      valSource: t.val_source ?? null,
      valYear: t.val_year ?? null,
      residualPct: t.residual_pct ?? null,
      valuePer1kBaseline: t.value_per_1k_baseline ?? null,
      residualEligible: residualEligibleGroups.has(t.group),
      href,
      displayName,
    };
  });

  _data = {
    generated: raw.generated,
    window: raw.window,
    version: raw.version,
    methodUrl: raw.method_url,
    groups: raw.groups,
    residualEligibleGroups,
    teams,
  };
  return _data;
}

export function formatFanValueM(m: number): string {
  if (m >= 1000) {
    const b = m / 1000;
    const s = b.toFixed(2).replace(/\.?0+$/, "");
    return `$${s}B`;
  }
  return `$${Math.round(m)}M`;
}

export function formatCompactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}
