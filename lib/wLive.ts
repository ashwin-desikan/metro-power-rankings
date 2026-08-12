import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { getWClubByName } from "@/lib/wfootball";
import { getNwslStandings } from "@/lib/nwsl-standings";
import { getSeasonSim, simIsCurrent, simBySlugResolved, fmtOdds } from "@/lib/seasonSim";

// Live women's club-football data (api-football -> committed bundle). The mini's
// scripts/apifootball/refresh_women.py writes public/data/football/wlive-2026.json
// (Liga F, NWSL, FA WSL standings + the UWCL group/knockout stage) and commits it
// with [vercel skip]. This lib reads it from GitHub raw at runtime via ISR -- same
// pattern as lib/clubFootballLive.ts -- so tables refresh without a deploy, falling
// back to the on-disk seed copy when raw is unavailable.
//
// Unlike the men's pipeline, team names are NOT pre-canonicalised through a Lookup
// table: rows carry the raw api-football club name and we resolve name -> women's
// club slug here via lib/wfootball's getWClubByName (the same fuzzy matcher the ESPN
// NWSL table already used). Server-only; listed in scripts/check-client-imports.mjs.

// ---- Raw bundle shape (as written by refresh_women.py) -------------------------
type RawRow = {
  rank: number | null; name: string | null;
  played: number | null; win: number | null; draw: number | null; lose: number | null;
  gf: number | null; ga: number | null; gd: number | null; points: number | null; form: string | null;
};
type RawGroup = { group_label: string; rows: RawRow[] };
type RawLeague = {
  league_id: number; hub_slug: string | null; comp_slug: string | null; name: string;
  country: string | null; kind: string; season: number; season_label: string;
  placeholder?: boolean; source?: string; groups: RawGroup[];
};
type RawFixture = {
  fixture_id: number; round: string | null; kickoff: string | null;
  home: { name: string | null }; away: { name: string | null };
  home_goals: number | null; away_goals: number | null; status: string | null;
};
type RawComp = {
  league_id: number; comp_slug: string; name: string; country: string | null;
  season: number; season_label: string; source?: string; groups: RawGroup[]; fixtures: RawFixture[];
};
type RawBundle = { generated_at: string | null; season: string; leagues: RawLeague[]; competitions: RawComp[] };

// ---- Serializable view models the client components render ----------------------
export type WLiveRowVM = { rank: number | null; name: string; slug: string | null; cells: (number | string)[] };
export type WLiveGroupVM = { label: string | null; rows: WLiveRowVM[] };
export type WLiveLeagueVM = {
  leagueId: number; name: string; hubSlug: string | null; compSlug: string | null;
  seasonLabel: string; placeholder: boolean; source: string; groups: WLiveGroupVM[]; hasRows: boolean;
};
export type WLiveFixtureVM = {
  id: number; round: string | null; date: string | null;
  home: { name: string; slug: string | null }; away: { name: string; slug: string | null };
  homeGoals: number | null; awayGoals: number | null; status: string | null;
};
export type WLiveCompVM = {
  leagueId: number; name: string; seasonLabel: string; source: string;
  groups: WLiveGroupVM[]; fixtures: WLiveFixtureVM[]; hasContent: boolean;
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/football";
const DASH = "—";
const NWSL_LEAGUE_ID = 254;

async function loadBundle(): Promise<RawBundle | null> {
  try {
    const res = await fetch(`${GH_RAW}/wlive-2026.json`, { next: { revalidate: 1800 } });
    if (res.ok) return (await res.json()) as RawBundle;
  } catch {
    /* fall through to disk */
  }
  try {
    const p = join(process.cwd(), "public", "data", "football", "wlive-2026.json");
    return JSON.parse(await readFile(p, "utf-8")) as RawBundle;
  } catch {
    return null;
  }
}

const num = (v: number | null | undefined): number | string => (v === null || v === undefined ? DASH : v);
// api-football suffixes every women's club with a bare " W" ("NJ/NY Gotham FC
// W", "Bay FC W"). getWClubByName's stop-word list drops "women"/"womens"/
// "ladies"/"feminin..." but NOT that one-letter token, so normName kept it and
// every NWSL row resolved to null: sixteen dead club links on /sports/standings,
// /teams/wfootball and the United States hub, plus nothing for the odds join to
// key on. Fixed here rather than by adding "w" to the shared stop list, because
// this is an api-football naming convention and a bare "w" is a plausible token
// in a real club name elsewhere.
const stripWSuffix = (s: string): string => s.replace(/\s+W$/u, "");

// Competitions whose tables render OUR club names rather than the vendor's.
//
// NWSL only, and the reason is completeness, not preference: all 16 NWSL rows
// resolve to a portal club, so the table reads consistently. FA WSL and Liga F
// still have clubs with no honours entry (Brighton, West Ham, Leicester;
// Athletic Club, Eibar, Espanyol, Atletico Madrid, Deportivo Alaves and two
// more), so canonicalising those today would produce a MIXED table -- some
// rows "Arsenal Women", others still "Brighton W" -- which reads worse than
// consistent vendor naming. Add a comp here once its clubs all resolve.
const CANONICAL_NAME_COMPS = new Set(["nwsl"]);

const resolveName = (
  name: string | null,
  canonical = false,
): { name: string; slug: string | null } => {
  const nm = name ?? DASH;
  if (!name) return { name: nm, slug: null };
  const club = getWClubByName(name) ?? getWClubByName(stripWSuffix(name));
  return { name: canonical && club ? club.name : nm, slug: club?.slug ?? null };
};

function toRowVM(r: RawRow, i: number, canonical = false): WLiveRowVM {
  const resolved = resolveName(r.name, canonical);
  return {
    rank: r.rank ?? i + 1,
    name: resolved.name,
    slug: resolved.slug,
    cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)],
  };
}

function toGroups(groups: RawGroup[], canonical = false): WLiveGroupVM[] {
  return groups.map((g) => ({
    label: g.group_label || null,
    rows: g.rows.map((r, i) => toRowVM(r, i, canonical)),
  }));
}

function leagueVM(l: RawLeague): WLiveLeagueVM {
  const groups = toGroups(l.groups, CANONICAL_NAME_COMPS.has(l.comp_slug ?? ""));
  const hasRows = groups.some((g) => g.rows.length > 0);
  return {
    leagueId: l.league_id, name: l.name, hubSlug: l.hub_slug, compSlug: l.comp_slug,
    seasonLabel: l.season_label, placeholder: !!l.placeholder, source: l.source ?? "api-football",
    groups, hasRows,
  };
}

function compVM(c: RawComp): WLiveCompVM {
  const groups = toGroups(c.groups);
  const fixtures: WLiveFixtureVM[] = c.fixtures.map((f) => ({
    id: f.fixture_id, round: f.round, date: f.kickoff,
    home: resolveName(f.home?.name ?? null), away: resolveName(f.away?.name ?? null),
    homeGoals: f.home_goals, awayGoals: f.away_goals, status: f.status,
  }));
  const hasContent = groups.some((g) => g.rows.length > 0) || fixtures.length > 0;
  return { leagueId: c.league_id, name: c.name, seasonLabel: c.season_label, source: c.source ?? "api-football", groups, fixtures, hasContent };
}

// ESPN NWSL snapshot -> the same league VM shape, so the hub can render it identically.
async function nwslFromEspn(): Promise<WLiveLeagueVM | null> {
  const snap = await getNwslStandings();
  if (snap.rows.length === 0) return null;
  const rows: WLiveRowVM[] = snap.rows.map((r, i) => {
    // ESPN fallback path: canonicalise too, so a source swap does not change
    // the names on the page.
    const resolved = resolveName(r.name, CANONICAL_NAME_COMPS.has("nwsl"));
    return {
      rank: r.rank ?? i + 1, name: resolved.name, slug: resolved.slug,
      cells: [r.played, r.wins, r.draws, r.losses, r.gf, r.ga, r.gd, r.points],
    };
  });
  return {
    leagueId: NWSL_LEAGUE_ID, name: snap.source_label || "NWSL", hubSlug: "united-states", compSlug: "nwsl",
    seasonLabel: snap.season_year ? String(snap.season_year) : "2026", placeholder: false, source: "ESPN",
    groups: [{ label: null, rows }], hasRows: rows.length > 0,
  };
}

// Display order for the women's hub tabs. The bundle's array order comes from
// scripts/apifootball/wleagues.json, which is maintained for the ETL rather
// than for the UI, and the first entry also becomes the DEFAULT SELECTED TAB in
// WLiveHub. Pinning the order here means the hub cannot silently reorder itself
// when that file is edited or when the ESPN fallback appends NWSL at the end.
// FA WSL (44) leads by editorial choice; anything unlisted keeps bundle order
// behind the pinned ones.
const LEAGUE_ORDER: number[] = [
  44,  // FA WSL (England)
  254, // NWSL (United States)
  142, // Liga F (Spain)
];

function orderLeagues(list: WLiveLeagueVM[]): WLiveLeagueVM[] {
  const rank = (id: number) => {
    const i = LEAGUE_ORDER.indexOf(id);
    return i === -1 ? LEAGUE_ORDER.length : i;
  };
  // Stable: equal ranks keep their original relative order.
  return list
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l.leagueId) - rank(b.l.leagueId) || a.i - b.i)
    .map((x) => x.l);
}

// All live league tables for the 2026-27 hub, NWSL resolved via bundle-then-ESPN.
export async function getWLiveLeagues(): Promise<WLiveLeagueVM[]> {
  const bundle = await loadBundle();
  const raw = bundle?.leagues ?? [];
  const out: WLiveLeagueVM[] = [];
  for (const l of raw) {
    const vm = leagueVM(l);
    if (vm.leagueId === NWSL_LEAGUE_ID && !vm.hasRows) {
      const espn = await nwslFromEspn();
      out.push(espn ?? vm);
    } else {
      out.push(vm);
    }
  }
  // If the bundle omitted NWSL entirely, still surface it from ESPN.
  if (!out.some((l) => l.leagueId === NWSL_LEAGUE_ID)) {
    const espn = await nwslFromEspn();
    if (espn) out.push(espn);
  }
  return orderLeagues(out);
}

// Live league table for one country hub (england | united-states | spain).
export async function getWLiveLeagueForHub(hubSlug: string): Promise<WLiveLeagueVM | null> {
  const leagues = await getWLiveLeagues();
  return leagues.find((l) => l.hubSlug === hubSlug) ?? null;
}

// ---- Playoff odds -------------------------------------------------------------

export type WLiveOddsVM = Record<
  string,
  { spots: number; labels: [string, string]; rows: Record<string, { po: string; title: string }> }
>;

/**
 * Playoff and title odds for the women's leagues that have a simulation,
 * keyed by comp slug then club slug, pre-formatted for display.
 *
 * NWSL only for now: it is the one women's league here with a playoff bracket
 * rather than a champion-is-the-table-winner format, so it is the only one
 * where "will they make the postseason" is a question worth simulating. WSL
 * and Liga F would need a different question (title race odds) and are
 * deliberately not faked from this machinery.
 *
 * The odds table is ESPN-keyed and the standings rows are api-football-keyed,
 * so the join runs through getWClubByName and FAILS CLOSED - see
 * simBySlugResolved. A club rebrand upstream hides the columns rather than
 * mislabelling a row.
 */
export async function getWLiveOdds(): Promise<WLiveOddsVM> {
  const out: WLiveOddsVM = {};
  const nwsl = await getSeasonSim("nwsl");
  if (!simIsCurrent(nwsl)) return out;
  const bySlug = simBySlugResolved(nwsl, (n) => getWClubByName(n)?.slug);
  if (!bySlug) return out;
  const rows: Record<string, { po: string; title: string }> = {};
  for (const [slug, r] of bySlug) {
    rows[slug] = { po: fmtOdds(r.p_playoffs), title: fmtOdds(r.p_title) };
  }
  out.nwsl = { spots: nwsl.meta.playoff_spots ?? 8, labels: ["PO%", "Title%"], rows };
  return out;
}

// Live UWCL (or any tournament) group/knockout data for its hub page.
export async function getWLiveCompetition(compSlug: string): Promise<WLiveCompVM | null> {
  const bundle = await loadBundle();
  const c = (bundle?.competitions ?? []).find((x) => x.comp_slug === compSlug);
  return c ? compVM(c) : null;
}
