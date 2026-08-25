import type { Metadata } from "next";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

import { getCurrentNflStandings } from "@/lib/standings";
import { getCurrentNbaStandings } from "@/lib/nba-standings";
import { getCurrentNhlStandings } from "@/lib/nhl-standings";
import { getCurrentMlbStandings } from "@/lib/mlb-standings";
import { getMlbSim, playoffOddsByCanonical, fmtOdds } from "@/lib/mlbSim";
import { getSeasonSim, simIsCurrent, simBySlug, simByName } from "@/lib/seasonSim";
import { getCurrentMlsStandings } from "@/lib/mls-standings";
import { getCurrentWnbaStandings } from "@/lib/wnba-standings";
import { getLiveCflStandings } from "@/lib/cflStandings";
import { getLiveF1Standings } from "@/lib/f1Standings";
import { getNpbStandings } from "@/lib/npbStandings";
import { getClubStandings, getClubCompetitions, getInternationalComps, type LiveLeague, type LiveComp, type LiveRow, type LiveFixture, type LiveTeamRef } from "@/lib/clubFootballLive";
import { getFootyLiveStandings } from "@/lib/_footyStandings";
import { getFootyFinals, finalsIsCurrent } from "@/lib/footyFinals";
import { getLiveGolfMajor } from "@/lib/golfLeaderboard";
import { getLiveTennisSlam } from "@/lib/tennisDraw";
import { f1ConstructorCrestName } from "@/lib/f1Crest";
import { getWtcStandings } from "@/lib/wtcStandings";
import { getRugbyFixtures, type RugbyMatch } from "@/lib/rugbyFixtures";
import { getCfbRankings, cfbSeasonStarted } from "@/lib/cfb-live";
import { getWLiveLeagues, getWLiveCompetition, getWLiveOdds, type WLiveLeagueVM, type WLiveFixtureVM, type WLiveOddsVM } from "@/lib/wLive";
import { getCricketFixtures, type CricketMatch } from "@/lib/cricketFixtures";

import { getAllFranchises as nflFranchises, logoUrlFor as nflLogo, monogramFor as nflMono } from "@/lib/nfl";
import { getAllFranchises as nbaFranchises, logoUrlFor as nbaLogo, monogramFor as nbaMono } from "@/lib/nba";
import { getAllFranchises as mlbFranchises, logoUrlFor as mlbLogo, monogramFor as mlbMono } from "@/lib/mlb";
import { getAllFranchises as nhlFranchises, logoUrlFor as nhlLogo, monogramFor as nhlMono } from "@/lib/nhl";
import { getWnbaFranchiseByTeamName, monogramFor as wnbaMono } from "@/lib/wnba";
import { getAllAflFranchises } from "@/lib/afl";
import { getAllNrlFranchises } from "@/lib/nrl";
import { getFootballClubByName } from "@/lib/football";
import { flagCdnUrl } from "@/lib/international-display";
// Season gating: see lib/seasonWindows.ts for why a calendar window sits
// alongside the games check rather than replacing it.
import { isLeagueLive, inSeasonWindow, tournamentIsCurrent } from "@/lib/seasonWindows";

export const revalidate = 120;

const PATH = "/sports/standings";
const TITLE = "Live Standings";
const DESC =
  "Every live league table the site tracks, in one place: European club football, Copa Libertadores, the four North American majors, college football rankings, MLS, the WSL, Liga F, NWSL and Women\u2019s Champions League, WNBA, CFL, NPB, AFL, NRL and F1. Refreshed through each season.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// ---- shared model -------------------------------------------------------
type Cell = string | number;
type Mono = { text: string; bg: string; fg: string };
type SRow = { rank: number | string | null; name: string; href?: string | null; logoUrl?: string | null; flagUrl?: string | null; crestName?: string | null; monogram?: Mono | null; cells: Cell[]; po?: boolean; cut?: boolean };
type SubTable = { title: string | null; columns: string[]; rows: SRow[] };
type Block = { league: string; href: string | null; note: string | null; open: boolean; subTables: SubTable[]; cols?: boolean; live?: boolean };
type SportGroup = { sport: string; blocks: Block[]; columns?: [Block[], Block[]] };

// The Football section on Live Standings renders as two columns: the LEFT column
// holds international + European competitions, the RIGHT column holds domestic
// leagues, each in the order below. When a NEW football table is added, place it
// in the correct column at the correct rank (ask which column + slot if unsure);
// anything not listed appends to the end of the right column.
const FOOTBALL_LEFT = [
  "Champions League",
  "Europa League",
  "Conference League",
  "Copa Libertadores",
];
const FOOTBALL_RIGHT = [
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "Eredivisie", "Primeira Liga", "Scottish Premiership",
  "MLS",
];
const orderBy = (list: string[]) => (a: Block, b: Block): number => {
  const ia = list.indexOf(a.league);
  const ib = list.indexOf(b.league);
  return (ia === -1 ? list.length : ia) - (ib === -1 ? list.length : ib);
};

const DASH = "—";
const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const pct3 = (v: number | null | undefined): Cell => (v === null || v === undefined ? DASH : v.toFixed(3).replace(/^0/, ""));
const num = (v: number | null | undefined): Cell => (v === null || v === undefined ? DASH : v);

// inSeasonFromGames used to live here. It now sits in lib/seasonWindows.ts
// paired with a calendar window, because on its own it cannot close a board:
// a club that ends on 161 of 162 keeps min < fullSeason true forever.

// Playoff-position marking, shared by every table on this page. Rows whose
// team currently holds a playoff/finals spot get a green tint (`po`), and the
// last row of a CONTIGUOUS leading run of playoff rows draws the cut line
// (`cut`). Non-contiguous fields (an NFL wild card sitting below a weak
// division leader, a CFL crossover) tint correctly and simply skip the line.
function applyPlayoffMarks<T>(items: T[], rows: SRow[], inField: (t: T) => boolean): void {
  let contiguous = true;
  let lastLead = -1;
  items.forEach((t, i) => {
    const po = inField(t);
    if (po) rows[i].po = true;
    if (po && contiguous) lastLead = i;
    if (!po) contiguous = false;
  });
  const anyBeyond = items.some((t, i) => i > lastLead && inField(t));
  if (lastLead >= 0 && lastLead < rows.length - 1 && !anyBeyond) rows[lastLead].cut = true;
}

function buildBlock<T>(opts: {
  league: string; href: string; note: string | null; open: boolean;
  items: T[]; columns: string[];
  sort: (a: T, b: T) => number;
  groups: { title: string; pick: (t: T) => boolean }[];
  row: (t: T, i: number) => SRow;
  // Current playoff field within a sorted group (or the whole sorted table
  // when the group split does not apply). Only evaluated on live tables -
  // callers pass undefined in the offseason.
  playoff?: (sorted: T[]) => (t: T) => boolean;
}): Block | null {
  if (opts.items.length === 0) return null;
  const mk = (items: T[]): SRow[] => {
    const sorted = items.slice().sort(opts.sort);
    const rows = sorted.map((t, i) => opts.row(t, i));
    if (opts.playoff) applyPlayoffMarks(sorted, rows, opts.playoff(sorted));
    return rows;
  };
  const all = mk(opts.items);
  const grouped: SubTable[] = opts.groups
    .map((g) => ({ title: g.title, columns: opts.columns, rows: mk(opts.items.filter(g.pick)) }))
    .filter((st) => st.rows.length > 0);
  const covered = grouped.reduce((a, st) => a + st.rows.length, 0);
  const subTables = grouped.length > 0 && covered === all.length ? grouped : [{ title: null, columns: opts.columns, rows: all }];
  return { league: opts.league, href: opts.href, note: opts.note, open: opts.open, subTables };
}

function Marker({ r }: { r: SRow }) {
  const monoEl = r.monogram
    ? <span className="inline-flex items-center justify-center rounded-sm font-bold flex-shrink-0" style={{ width: 15, height: 15, background: r.monogram.bg, color: r.monogram.fg, fontSize: 7 }}>{r.monogram.text}</span>
    : <span className="inline-block flex-shrink-0" style={{ width: 15 }} />;
  if (r.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.logoUrl} alt="" aria-hidden width={15} height={15} className="object-contain flex-shrink-0" style={{ width: 15, height: 15 }} loading="lazy" decoding="async" />;
  }
  if (r.flagUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.flagUrl} alt="" aria-hidden width={18} height={13} className="object-contain flex-shrink-0" style={{ width: 18, height: 13 }} loading="lazy" decoding="async" />;
  }
  if (r.crestName) return <TeamCrest name={r.crestName} size={15} fallback={monoEl} />;
  return monoEl;
}

function NameCell({ r }: { r: SRow }) {
  const content = (
    <span className="inline-flex items-center gap-1.5">
      <Marker r={r} />
      <span>{r.name}</span>
    </span>
  );
  return r.href ? <Link href={r.href} className="hover:text-[var(--accent)]">{content}</Link> : content;
}

function LeagueAccordion({ block }: { block: Block }) {
  if (block.subTables.length === 0) return null;
  return (
    <details open={block.open} className="rounded-xl border overflow-hidden" style={cardStyle}>
      <summary className="cursor-pointer select-none px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          {block.live && (
            <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" aria-label="In season" title="Currently in season" />
          )}
          {block.league}
        </span>
        <span className="flex items-center gap-2">
          {block.note && <span className="text-[10px] text-[var(--text-dim)]">{block.note}</span>}
          {block.href && (
            <Link
              href={block.href}
              className="text-[10px] px-2 py-0.5 rounded-full border text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
              style={{ borderColor: "var(--border)" }}
            >
              Hub ↗
            </Link>
          )}
        </span>
      </summary>
      <div className={`border-t px-3 py-3 ${block.cols ? "grid grid-cols-1 md:grid-cols-2 gap-4 items-start" : "space-y-4"}`} style={{ borderColor: "var(--border)" }}>
        {block.subTables.map((st, si) => (
          <div key={si}>
            {st.title && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{st.title}</div>}

            {/* Mobile: stacked cards instead of a table forced wide by min-w */}
            <div className="grid grid-cols-1 gap-1.5 sm:hidden">
              {st.rows.map((r, i) => (
                <div key={`${r.name}-${i}-card`} className="rounded-md border px-2.5 py-2"
                  style={r.po
                    ? { borderColor: "var(--border)", borderLeft: "3px solid rgba(34,197,94,0.55)", background: "rgba(34,197,94,0.05)" }
                    : { borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 text-xs font-medium">
                      <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{r.rank ?? i + 1}</span>
                      <span className="truncate"><NameCell r={r} /></span>
                    </div>
                  </div>
                  {st.columns.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                      {st.columns.map((c, j) => (
                        <span key={c} className="inline-flex items-baseline gap-1">
                          <span className="text-[var(--text-dim)]">{c}</span>
                          <span className="tabular-nums" style={mono}>{r.cells[j]}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full text-xs min-w-[320px]" data-sticky-col="2">
                <thead>
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="py-1 px-1.5 font-medium text-right">#</th>
                    <th className="py-1 px-1.5 font-medium">Club</th>
                    {st.columns.map((c) => (
                      <th key={c} className="py-1 px-1.5 font-medium text-right tabular-nums">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {st.rows.map((r, i) => (
                    <tr key={`${r.name}-${i}`} className="border-t"
                      style={{
                        borderColor: "var(--border)",
                        ...(r.po ? { background: "rgba(34,197,94,0.06)" } : null),
                        // The cut line under the last playoff spot rides an inset
                        // shadow so the next row's border-t stays intact.
                        ...(r.cut ? { boxShadow: "inset 0 -2px 0 rgba(34,197,94,0.45)" } : null),
                      }}>
                      <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
                      <td className="py-1 px-1.5 font-medium whitespace-nowrap"><NameCell r={r} /></td>
                      {r.cells.map((c, j) => (
                        <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

// ---- North American majors ---------------------------------------------

async function nflBlock(): Promise<Block | null> {
  const s = await getCurrentNflStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(nflFranchises().map((f) => [f.canonical, f]));
  const live = isLeagueLive("nfl", teams.map((t) => t.games_played), 17);
  const nameOf = (t: (typeof teams)[number]) => fr.get(t.canonical)?.name ?? t.display_name;
  const row = (t: (typeof teams)[number], i: number): SRow => {
    const f = fr.get(t.canonical); const m = f ? nflMono(f.slug) : null;
    return { rank: live ? i + 1 : null, name: nameOf(t), href: f ? `/teams/nfl/${f.slug}` : null,
      logoUrl: f ? nflLogo(f.slug) : null, monogram: m ? { text: m.mono, bg: m.bg, fg: m.fg } : null,
      cells: live ? [t.wins, t.losses, t.ties, pct3(t.win_pct)] : [DASH, DASH, DASH, DASH] };
  };
  return buildBlock({
    league: "NFL", href: "/teams/nfl", note: live ? s.source_label : "Offseason", open: live,
    items: teams, columns: ["W", "L", "T", "PCT"],
    sort: live ? (a, b) => b.win_pct - a.win_pct || b.wins - a.wins : (a, b) => nameOf(a).localeCompare(nameOf(b)),
    groups: [{ title: "AFC", pick: (t) => t.conference === "AFC" }, { title: "NFC", pick: (t) => t.conference === "NFC" }],
    row,
    // ESPN's playoffSeed already applies the real seeding rules (division
    // winners first, then wild cards), so seed <= 7 IS the current field.
    playoff: live ? () => (t) => t.playoff_seed !== null && t.playoff_seed <= 7 : undefined,
  });
}

async function nbaBlock(): Promise<Block | null> {
  const s = await getCurrentNbaStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(nbaFranchises().map((f) => [f.canonical, f]));
  const live = isLeagueLive("nba", teams.map((t) => t.games_played), 82);
  const nameOf = (t: (typeof teams)[number]) => fr.get(t.canonical)?.name ?? t.display_name;
  const row = (t: (typeof teams)[number], i: number): SRow => {
    const f = fr.get(t.canonical); const m = f ? nbaMono(f.slug) : null;
    return { rank: live ? i + 1 : null, name: nameOf(t), href: f ? `/teams/nba/${f.slug}` : null,
      logoUrl: f ? nbaLogo(f.slug) : null, monogram: m ? { text: m.mono, bg: m.bg, fg: m.fg } : null,
      cells: live ? [t.wins, t.losses, pct3(t.win_pct)] : [DASH, DASH, DASH] };
  };
  return buildBlock({
    league: "NBA", href: "/teams/nba", note: live ? s.source_label : "Offseason", open: live,
    items: teams, columns: ["W", "L", "PCT"],
    sort: live ? (a, b) => b.win_pct - a.win_pct : (a, b) => nameOf(a).localeCompare(nameOf(b)),
    groups: [{ title: "Eastern Conference", pick: (t) => t.conf === "Eastern" }, { title: "Western Conference", pick: (t) => t.conf === "Western" }],
    row,
    // Seeds 1-10 reach the postseason bracket (7-10 via the play-in).
    playoff: live ? () => (t) => t.playoff_seed !== null && t.playoff_seed <= 10 : undefined,
  });
}

async function nhlBlock(): Promise<Block | null> {
  const s = await getCurrentNhlStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(nhlFranchises().map((f) => [f.canonical, f]));
  const live = isLeagueLive("nhl", teams.map((t) => t.games_played), 82);
  const nameOf = (t: (typeof teams)[number]) => fr.get(t.canonical)?.name ?? t.display_name;
  const row = (t: (typeof teams)[number], i: number): SRow => {
    const f = fr.get(t.canonical); const m = f ? nhlMono(f.slug) : null;
    return { rank: live ? i + 1 : null, name: nameOf(t), href: f ? `/teams/nhl/${f.slug}` : null,
      logoUrl: f ? nhlLogo(f.slug) : null, monogram: m ? { text: m.mono, bg: m.bg, fg: m.fg } : null,
      cells: live ? [t.games_played, t.wins, t.losses, t.ot_losses, t.points] : [DASH, DASH, DASH, DASH, DASH] };
  };
  return buildBlock({
    league: "NHL", href: "/teams/hockey", note: live ? s.source_label : "Offseason", open: live,
    items: teams, columns: ["GP", "W", "L", "OTL", "PTS"],
    sort: live ? (a, b) => b.points - a.points || b.wins - a.wins || b.goal_diff - a.goal_diff : (a, b) => nameOf(a).localeCompare(nameOf(b)),
    groups: [{ title: "Eastern Conference", pick: (t) => t.conference === "E" }, { title: "Western Conference", pick: (t) => t.conference === "W" }],
    row,
    // ESPN's playoffSeed carries the divisional top-3 + wild-card rules;
    // 8 per conference make the field.
    playoff: live ? () => (t) => t.playoff_seed !== null && t.playoff_seed <= 8 : undefined,
  });
}

async function mlbBlock(): Promise<Block | null> {
  const [s, sim] = await Promise.all([getCurrentMlbStandings(), getMlbSim()]);
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  // Playoff odds from our own Monte Carlo (scripts/predictions/build_mlb_sim.py).
  // Column appears only when the sim covers all 30 clubs and the season is
  // under way, so an offseason or a stale/absent file leaves the table exactly
  // as it was rather than printing a row of dashes.
  const odds = playoffOddsByCanonical(sim);
  const showOdds = odds.size >= 30 && (sim?.meta.games_played ?? 0) > 0;
  // World Series odds ride the same file; the sim computes them already.
  const wsOdds = new Map((sim?.table ?? []).map((r) => [r.canonical, r.p_ws]));
  const fr = new Map(mlbFranchises().map((f) => [f.canonical, f]));
  const live = isLeagueLive("mlb", teams.map((t) => t.games_played), 162);
  const nameOf = (t: (typeof teams)[number]) => fr.get(t.canonical)?.name ?? t.display_name;
  const leagueOf = (t: (typeof teams)[number]): "AL" | "NL" | "" => {
    if (t.league === "AL" || t.league === "NL") return t.league;
    const d = (t.division || "").toLowerCase();
    if (d.startsWith("al") || d.includes("american")) return "AL";
    if (d.startsWith("nl") || d.includes("national")) return "NL";
    return "";
  };
  const gb = new Map<string, Cell>();
  if (live) {
    for (const lg of ["AL", "NL"] as const) {
      const g = teams.filter((t) => leagueOf(t) === lg).sort((a, b) => b.win_pct - a.win_pct || b.wins - a.wins);
      const leader = g[0];
      g.forEach((t, i) => {
        const v = leader ? (leader.wins - t.wins + (t.losses - leader.losses)) / 2 : 0;
        gb.set(t.canonical, i === 0 || v <= 0 ? DASH : Number.isInteger(v) ? v : v.toFixed(1));
      });
    }
  }
  const row = (t: (typeof teams)[number], i: number): SRow => {
    const f = fr.get(t.canonical); const m = f ? mlbMono(f.slug) : null;
    return { rank: live ? i + 1 : null, name: nameOf(t), href: f ? `/teams/mlb/${f.slug}` : null,
      logoUrl: f ? mlbLogo(f.slug) : null, monogram: m ? { text: m.mono, bg: m.bg, fg: m.fg } : null,
      cells: live
        ? [t.wins, t.losses, pct3(t.win_pct), gb.get(t.canonical) ?? DASH,
           ...(showOdds ? [fmtOdds(odds.get(t.canonical)), fmtOdds(wsOdds.get(t.canonical))] : [])]
        : [DASH, DASH, DASH, DASH, ...(showOdds ? [DASH, DASH] : [])] };
  };
  return buildBlock({
    league: "MLB", href: "/teams/mlb",
    note: live ? (showOdds ? `${s.source_label} · odds simulated` : s.source_label) : "Offseason",
    open: live,
    items: teams, columns: ["W", "L", "PCT", "GB", ...(showOdds ? ["PO%", "WS%"] : [])],
    sort: live ? (a, b) => b.win_pct - a.win_pct || b.wins - a.wins : (a, b) => nameOf(a).localeCompare(nameOf(b)),
    groups: [{ title: "American League", pick: (t) => leagueOf(t) === "AL" }, { title: "National League", pick: (t) => leagueOf(t) === "NL" }],
    row,
    // Three division winners + three wild cards per league; ESPN's seed
    // already encodes that, and it is null for eliminated clubs late on.
    playoff: live ? () => (t) => t.playoff_seed !== null && t.playoff_seed <= 6 : undefined,
  });
}

async function wnbaBlock(): Promise<Block | null> {
  const [s, sim] = await Promise.all([getCurrentWnbaStandings(), getSeasonSim("wnba")]);
  if (s.rows.length === 0) return null;
  const live = isLeagueLive("wnba", s.rows.map((t) => t.games_played), 44);
  const showOdds = live && simIsCurrent(sim);
  const odds = simByName(sim); // sim rows carry the same ESPN displayName as t.name
  // WNBA seeding is overall record, conference-blind: the field is the best
  // eight records across BOTH conferences, so compute it once globally
  // rather than per displayed sub-table.
  const field = new Set(
    s.rows.slice().sort((a, b) => b.win_pct - a.win_pct || b.wins - a.wins).slice(0, 8).map((t) => t.name),
  );
  const row = (t: (typeof s.rows)[number], i: number): SRow => {
    const f = getWnbaFranchiseByTeamName(t.name); const m = f ? wnbaMono(f) : null;
    const o = odds.get(t.name);
    return { rank: live ? i + 1 : null, name: f?.name ?? t.name, href: f ? `/teams/wnba/${f.slug}` : null,
      crestName: f?.name ?? t.name, monogram: m ? { text: m.abbr, bg: m.color, fg: "#fff" } : null,
      cells: live
        ? [t.wins, t.losses, pct3(t.win_pct), ...(showOdds ? [fmtOdds(o?.p_playoffs), fmtOdds(o?.p_title)] : [])]
        : [DASH, DASH, DASH, ...(showOdds ? [DASH, DASH] : [])] };
  };
  return buildBlock({
    league: "WNBA", href: "/teams/wnba",
    note: live ? (showOdds ? `${s.source_label} · odds simulated` : s.source_label) : "Offseason", open: live,
    items: s.rows, columns: ["W", "L", "PCT", ...(showOdds ? ["PO%", "Title%"] : [])],
    sort: live ? (a, b) => b.win_pct - a.win_pct : (a, b) => a.name.localeCompare(b.name),
    groups: [{ title: "Eastern Conference", pick: (t) => t.conf === "Eastern" }, { title: "Western Conference", pick: (t) => t.conf === "Western" }],
    row,
    playoff: live ? () => (t) => field.has(t.name) : undefined,
  });
}

// ---- everything else ----------------------------------------------------

async function mlsBlock(): Promise<Block | null> {
  const [s, sim] = await Promise.all([getCurrentMlsStandings(), getSeasonSim("mls")]);
  const live = inSeasonWindow("mls");
  const showOdds = live && simIsCurrent(sim);
  const odds = simByName(sim); // sim rows carry the same ESPN displayName as t.name
  return buildBlock({
    league: "MLS", href: "/teams/football",
    note: showOdds ? `${s.source_label} · odds simulated` : s.source_label, open: live,
    items: s.rows, columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts", ...(showOdds ? ["PO%", "Cup%"] : [])],
    sort: (a, b) => b.points - a.points || b.gd - a.gd,
    groups: [{ title: "Eastern Conference", pick: (t) => t.conf === "Eastern" }, { title: "Western Conference", pick: (t) => t.conf === "Western" }],
    row: (t, i) => {
      const c = getFootballClubByName(t.name); const nm = c?.cur_name ?? t.name;
      const o = odds.get(t.name);
      return { rank: i + 1, name: nm, href: c ? `/teams/football/${c.slug}` : null, crestName: nm,
        cells: [t.played, t.wins, t.draws, t.losses, t.gf, t.ga, t.gd, t.points,
          ...(showOdds ? [fmtOdds(o?.p_playoffs), fmtOdds(o?.p_title)] : [])] };
    },
    // Nine per conference reach the postseason (seeds 8 and 9 via the
    // wild-card game). Rows are sorted by points here, matching seeding.
    playoff: live ? (sorted) => { const nine = new Set(sorted.slice(0, 9)); return (t) => nine.has(t); } : undefined,
  });
}

// ---- Women's club football (wlive bundle -> same source as /teams/wfootball) ----
// One block per league (WSL / Liga F / NWSL) plus a UWCL fixtures block. All
// collapsed by default; the green dot lights once a league has played games.
function wLeagueBlock(
  l: WLiveLeagueVM | undefined,
  label: string,
  odds?: WLiveOddsVM[string],
): Block | null {
  if (!l || !l.hasRows) return null;
  // Odds and the playoff cut only apply to a league that has a simulation
  // (NWSL). The join is by club slug and has already failed closed upstream
  // if any club did not resolve -- see getWLiveOdds.
  const showOdds = !!odds;
  const spots = odds?.spots ?? 0;
  const subTables: SubTable[] = l.groups
    .map((g): SubTable => ({
      title: l.groups.length > 1 ? g.label : null,
      columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts", ...(showOdds ? odds!.labels : [])],
      rows: g.rows.map((r, i): SRow => {
        const rank = r.rank ?? i + 1;
        const o = showOdds ? odds!.rows[r.slug ?? ""] : undefined;
        return {
          rank, name: r.name,
          href: r.slug ? `/teams/wfootball/clubs/${r.slug}` : null,
          crestName: r.name,
          cells: [...r.cells, ...(showOdds ? [o?.po ?? "—", o?.title ?? "—"] : [])],
          ...(showOdds && rank <= spots ? { po: true } : null),
          ...(showOdds && rank === spots && i < g.rows.length - 1 ? { cut: true } : null),
        };
      }),
    }))
    .filter((st) => st.rows.length > 0);
  if (subTables.length === 0) return null;
  const played = l.groups.some((g) => g.rows.some((r) => Number(r.cells[0]) > 0));
  const note = showOdds ? `${l.seasonLabel} · odds simulated` : l.seasonLabel;
  return { league: label, href: "/teams/wfootball", note, open: false, live: played, subTables };
}

function uwclBlock(c: Awaited<ReturnType<typeof getWLiveCompetition>>): Block | null {
  if (!c || !c.hasContent) return null;
  const FIN = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
  const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const fx = c.fixtures;
  const liveFx = fx.filter((f) => f.status && IN_PLAY.has(f.status));
  const recent = fx.filter((f) => f.status && FIN.has(f.status)).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 10);
  const upcoming = fx.filter((f) => !(f.status && (FIN.has(f.status) || IN_PLAY.has(f.status)))).sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? ""))).slice(0, 12);
  const mk = (title: string, items: WLiveFixtureVM[], score: boolean): SubTable | null =>
    items.length ? {
      title, columns: [score ? "Score" : "Date"],
      rows: items.map((f): SRow => ({ rank: null, name: `${f.home.name} v ${f.away.name}`,
        cells: [score && f.homeGoals != null && f.awayGoals != null ? `${f.homeGoals}\u2013${f.awayGoals}` : dt(f.date)] })),
    } : null;
  const groupTables: SubTable[] = c.groups
    .map((g): SubTable => ({
      title: g.label, columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
      rows: g.rows.map((r, i): SRow => ({ rank: r.rank ?? i + 1, name: r.name, href: r.slug ? `/teams/wfootball/clubs/${r.slug}` : null, crestName: r.name, cells: r.cells })),
    }))
    .filter((st) => st.rows.length > 0);
  const subTables = [...groupTables, mk("Live", liveFx, true), mk("Upcoming", upcoming, false), mk("Recent", recent, true)]
    .filter((st): st is SubTable => st !== null);
  if (subTables.length === 0) return null;
  return { league: "Women's Champions League", href: "/teams/wfootball", note: c.seasonLabel, open: false, live: liveFx.length > 0 || upcoming.length > 0, subTables };
}

async function npbBlock(): Promise<Block | null> {
  const [s, sim] = await Promise.all([getNpbStandings(), getSeasonSim("npb")]);
  if (!s || (s.central.length === 0 && s.pacific.length === 0)) return null;
  // Closes for the Japanese offseason. The feed keeps serving the final table
  // all winter, so without the window this sat open showing a finished season.
  const npbLive = inSeasonWindow("npb");
  const showOdds = npbLive && simIsCurrent(sim);
  const odds = simBySlug(sim);
  const toRows = (rows: typeof s.central): SRow[] => {
    const out = rows.map((r): SRow => ({
      rank: r.rank, name: r.name, href: r.slug ? `/teams/baseball/npb/${r.slug}` : null, crestName: r.name,
      cells: [r.win, r.lose, r.draw, r.pct, r.gamesBehind,
        ...(showOdds ? [fmtOdds(r.slug ? odds.get(r.slug)?.p_playoffs : null), fmtOdds(r.slug ? odds.get(r.slug)?.p_title : null)] : [])],
    }));
    // Top three per league reach the Climax Series; rows arrive rank-sorted.
    if (npbLive) applyPlayoffMarks(rows, out, (r) => rows.indexOf(r) < 3);
    return out;
  };
  const cols = ["W", "L", "T", "PCT", "GB", ...(showOdds ? ["CS%", "Title%"] : [])];
  const subTables: SubTable[] = [
    { title: "Central League", columns: cols, rows: toRows(s.central) },
    { title: "Pacific League", columns: cols, rows: toRows(s.pacific) },
  ].filter((st) => st.rows.length > 0);
  return { league: "NPB", href: "/teams/baseball/npb", note: npbLive ? (showOdds ? `${s.year} · odds simulated` : `${s.year}`) : `${s.year} final`, open: npbLive, live: npbLive, subTables };
}

// ---- club football (api-football -> Supabase -> committed bundles) ------

// English lower divisions (Championship 40, League One 41, League Two 42,
// National League 43) intentionally NOT surfaced here (2026-08-01): the top
// five leagues plus the smaller national top flights keep the section tight.
const DOMESTIC_LIVE: { label: string; id: number }[] = [
  { label: "Premier League", id: 39 }, { label: "La Liga", id: 140 }, { label: "Bundesliga", id: 78 },
  { label: "Serie A", id: 135 }, { label: "Ligue 1", id: 61 },
  { label: "Eredivisie", id: 88 }, { label: "Primeira Liga", id: 94 }, { label: "Scottish Premiership", id: 179 },
];

function clubRow(r: LiveRow, i: number, cols: "domestic" | "group"): SRow {
  const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
  const nm = c?.cur_name ?? r.name ?? r.lookup ?? "";
  const cells = cols === "domestic"
    ? [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)]
    : [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gd), num(r.points)];
  return { rank: r.rank ?? i + 1, name: nm, href: c ? `/teams/football/${c.slug}` : null, crestName: nm, cells };
}

const byPtsGd = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);

function domesticLiveBlock(league: LiveLeague | undefined, label: string): Block | null {
  if (!league) return null;
  const subTables: SubTable[] = league.groups
    .map((g): SubTable => ({
      title: league.groups.length > 1 ? g.group_label : null,
      columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
      rows: g.rows.slice().sort(byPtsGd).map((r, i) => clubRow(r, i, "domestic")),
    }))
    .filter((st) => st.rows.length > 0);
  if (subTables.length === 0) return null;
  return { league: label, href: "/teams/football/2026-27", note: "live", open: true, subTables };
}

// ---- International Football section -------------------------------------
// Fed by the same api-football bundle as the club comps ("international" key:
// league_id 5 = UEFA Nations League, 7 = AFC Asian Cup). Group tables once a
// tournament's group stage starts; fixtures before and between matchdays.
// Nations render with flags, not club crests; names come straight from the
// bundle (nation passthrough — no Lookup involved).
// Generic over the international comps carried in the bundle: the Nations
// League and the AFC Asian Cup are structurally identical here (group tables
// plus a fixture list), so the label, hub anchor and the two notes are the
// only things that vary.
function intlCompBlock(
  comp: LiveComp | undefined,
  opts: { label: string; href: string; liveNote: string; closedNote: string },
): Block | null {
  if (!comp) return null;
  const FIN = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
  const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
  const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const nation = (t: LiveTeamRef) => t.name ?? t.lookup ?? "TBD";
  const groupTables: SubTable[] = comp.groups
    .slice().sort((a, b) => a.group_label.localeCompare(b.group_label))
    .map((g): SubTable => ({
      title: g.group_label,
      columns: ["P", "W", "D", "L", "GD", "Pts"],
      rows: g.rows.slice().sort(byPtsGd).map((r, i): SRow => ({
        rank: r.rank ?? i + 1, name: r.name ?? "", flagUrl: _crFlag(r.name ?? ""),
        cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gd), num(r.points)],
      })),
    }))
    .filter((st) => st.rows.length > 0);
  const fx = comp.fixtures ?? [];
  const byKo = (dir: number) => (a: LiveFixture, b: LiveFixture) => dir * String(a.kickoff ?? "").localeCompare(String(b.kickoff ?? ""));
  const live = fx.filter((f) => f.status && IN_PLAY.has(f.status)).sort(byKo(1));
  const recent = fx.filter((f) => f.status && FIN.has(f.status)).sort(byKo(-1)).slice(0, 12);
  const upcoming = fx.filter((f) => !(f.status && (FIN.has(f.status) || IN_PLAY.has(f.status)))).sort(byKo(1)).slice(0, 20);
  const mkFx = (title: string, items: LiveFixture[], score: boolean): SubTable | null =>
    items.length ? {
      title, columns: [score ? "Score" : "Date"],
      rows: items.map((f): SRow => ({ rank: null, name: `${nation(f.home)} v ${nation(f.away)}`, flagUrl: _crFlag(nation(f.home)),
        cells: [score && f.home_goals != null && f.away_goals != null ? `${f.home_goals}–${f.away_goals}` : dt(f.kickoff)] })),
    } : null;
  const subTables = [...groupTables,
    ...[mkFx("Live", live, true), mkFx("Upcoming", upcoming, false), mkFx("Recent", recent, true)]
      .filter((st): st is SubTable => st !== null)];
  if (subTables.length === 0) return null;

  // DATE GATE (Ashwin, 2026-08-06): show an international competition only
  // while it is actually happening. The bundle carries a tournament's whole
  // fixture list from the moment the draw is made, so "do we have data" left
  // the AFC Asian Cup on this page from August with a first kickoff in
  // January. Data-driven rather than a hardcoded calendar, so a tournament
  // that moves needs no code change: in play now, or group games already
  // played, or a kickoff within a fortnight, or a result in the last ten days.
  const current = tournamentIsCurrent({
    hasLive: live.length > 0,
    hasPlayedGroupGames: comp.groups.some((g) => g.rows.some((r) => Number(r.played ?? 0) > 0)),
    nextKickoff: upcoming[0]?.kickoff ?? null,
    lastFinished: recent[0]?.kickoff ?? null,
  });
  if (!current) return null;

  return {
    league: opts.label, href: opts.href,
    note: groupTables.length ? opts.liveNote : opts.closedNote,
    open: false, live: live.length > 0, subTables,
  };
}

function libertadoresBlock(comp: LiveComp | undefined): Block | null {
  if (!comp || comp.groups.length === 0) return null;
  const subTables: SubTable[] = comp.groups
    .slice().sort((a, b) => a.group_label.localeCompare(b.group_label))
    .map((g): SubTable => ({
      title: g.group_label,
      columns: ["P", "W", "D", "L", "GD", "Pts"],
      rows: g.rows.slice().sort(byPtsGd).map((r, i) => clubRow(r, i, "group")),
    }))
    .filter((st) => st.rows.length > 0);
  if (subTables.length === 0) return null;
  return { league: "Copa Libertadores", href: "/teams/football/2026-27", note: "group stage", open: true, subTables };
}

async function cflBlock(): Promise<Block | null> {
  const [s, sim] = await Promise.all([getLiveCflStandings(new Date().getFullYear()), getSeasonSim("cfl")]);
  if (!s) return null;
  const cflLive = inSeasonWindow("cfl");
  const showOdds = cflLive && simIsCurrent(sim);
  const odds = simBySlug(sim);
  const order = ["East", "West"];
  const sorted = s.divisions.slice().sort((a, b) => order.indexOf(a.division) - order.indexOf(b.division));
  // Current playoff field, crossover rule included: top 3 per division, but a
  // 4th place strictly ahead of the other division's 3rd on points crosses
  // over and takes that spot (a tie stays with the 3rd-place team).
  const field = new Set<string>();
  if (cflLive && sorted.length === 2) {
    const [d1, d2] = sorted;
    for (const [own, other] of [[d1, d2], [d2, d1]] as const) {
      const third = own.rows[2];
      const cross = other.rows[3];
      for (const t of own.rows.slice(0, 2)) field.add(t.slug);
      if (third) field.add(cross && third && cross.pts > third.pts ? cross.slug : third.slug);
    }
  }
  const subTables = sorted.map((d): SubTable => {
    const rows = d.rows.map((t): SRow => ({
      rank: null, name: t.name, href: t.slug ? `/teams/cfl/${t.slug}` : null, crestName: t.name,
      cells: [t.gp, t.w, t.l, t.t, t.pts, t.pf, t.pa,
        ...(showOdds ? [fmtOdds(odds.get(t.slug)?.p_playoffs), fmtOdds(odds.get(t.slug)?.p_title)] : [])],
    }));
    if (cflLive) applyPlayoffMarks(d.rows, rows, (t) => field.has(t.slug));
    return { title: `${d.division} Division`, columns: ["GP", "W", "L", "T", "Pts", "PF", "PA", ...(showOdds ? ["PO%", "Cup%"] : [])], rows };
  }).filter((st) => st.rows.length > 0);
  if (subTables.length === 0) return null;
  return { league: "CFL", href: "/teams/cfl", note: cflLive ? (showOdds ? `${s.year} · odds simulated` : `${s.year}`) : `${s.year} final`, open: cflLive, live: cflLive, subTables };
}

async function footyBlock(league: "afl" | "nrl"): Promise<Block | null> {
  const [s, sim, finals] = await Promise.all([
    getFootyLiveStandings(league), getSeasonSim(league), getFootyFinals(league),
  ]);
  if (!s || s.rows.length === 0) return null;
  // September: a finals strip above the ladder (real fixtures from
  // scripts/ingest/footy_finals.py; the full bracket lives on the hub).
  const finalsSub: SubTable | null = finalsIsCurrent(finals)
    ? {
        title: `${finals.meta.season} Finals`,
        columns: ["Result / Date", "Venue"],
        rows: finals.weeks.flatMap((w) =>
          w.games.map((g): SRow => {
            const nm = (side: typeof g.home) => side?.name ?? "TBC";
            const label = `${g.code ?? w.label} · ${
              g.completed && g.winner
                ? `${nm(g.winner === "home" ? g.home : g.away)} def. ${nm(g.winner === "home" ? g.away : g.home)}`
                : `${nm(g.home)} v ${nm(g.away)}`
            }`;
            const when =
              g.state !== "pre" && g.home?.score !== null && g.home?.score !== undefined && g.away
                ? `${g.home.score}–${g.away.score}`
                : g.date
                  ? new Date(g.date).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" })
                  : DASH;
            return { rank: null, name: label, cells: [when, g.venue ?? DASH] };
          }),
        ),
      }
    : null;
  const footyLive = inSeasonWindow(league); // "afl" | "nrl" are both SeasonKeys
  const showOdds = footyLive && simIsCurrent(sim);
  const odds = simBySlug(sim);
  // Finals spots: the AFL's 2026 format takes ten (7-10 via the wildcard
  // round); the NRL keeps its top eight.
  const spots = league === "afl" ? 10 : 8;
  const franchises = league === "afl" ? getAllAflFranchises() : getAllNrlFranchises();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const cols = [
    ...(league === "afl" ? ["P", "W", "L", "D", "For", "Agst", "Pts"] : ["P", "W", "D", "L", "For", "Agst", "Pts"]),
    ...(showOdds ? ["Finals%", "Prem%"] : []),
  ];
  const rows: SRow[] = s.rows.map((t) => {
    const f = t.slug ? bySlug.get(t.slug) : undefined;
    const name = f?.name ?? t.name;
    const o = t.slug ? odds.get(t.slug) : undefined;
    return {
      rank: t.rank, name,
      href: t.slug ? `/teams/${league}/${t.slug}` : null,
      crestName: name,
      monogram: f ? { text: f.abbr, bg: f.color, fg: "#fff" } : null,
      cells: [
        ...(league === "afl"
          ? [num(t.played), num(t.w), num(t.l), num(t.d), num(t.pf), num(t.pa), num(t.pts)]
          : [num(t.played), num(t.w), num(t.d), num(t.l), num(t.pf), num(t.pa), num(t.pts)]),
        ...(showOdds ? [fmtOdds(o?.p_playoffs), fmtOdds(o?.p_title)] : []),
      ],
    };
  });
  if (footyLive) applyPlayoffMarks(s.rows, rows, (t) => (t.rank ?? 99) <= spots);
  return {
    league: league.toUpperCase(), href: `/teams/${league}`,
    note: finalsSub ? `${s.year} finals` : footyLive ? (showOdds ? `${s.year} · odds simulated` : `${s.year}`) : `${s.year} final`,
    open: footyLive, live: footyLive,
    subTables: [
      ...(finalsSub ? [finalsSub] : []),
      { title: finalsSub ? `${s.year} Ladder` : null, columns: cols, rows },
    ],
  };
}

async function f1Block(): Promise<Block | null> {
  const s = await getLiveF1Standings();
  if (s.drivers.length === 0) return null;
  const drivers: SubTable = {
    title: "Drivers",
    columns: ["Team", "Pts", "Wins"],
    rows: s.drivers.map((d): SRow => ({ rank: d.pos, name: d.driver, crestName: f1ConstructorCrestName(d.team), cells: [d.team ?? DASH, num(d.points), num(d.wins)] })),
  };
  const constructors: SubTable = {
    title: "Constructors",
    columns: ["Pts", "Wins"],
    rows: s.constructors.map((c): SRow => ({ rank: c.pos, name: c.constructor, crestName: f1ConstructorCrestName(c.constructor), cells: [num(c.points), num(c.wins)] })),
  };
  const f1Live = inSeasonWindow("f1");
  return { league: "Formula 1", href: "/teams/f1", note: f1Live ? (s.source === "espn" ? "live" : `${s.season}`) : `${s.season} final`, open: f1Live, live: f1Live, cols: true, subTables: [drivers, constructors] };
}

async function wtcBlock(): Promise<Block | null> {
  const s = await getWtcStandings();
  if (!s || s.rows.length === 0) return null;
  const rows: SRow[] = s.rows.map((r) => ({ rank: r.position, name: r.name, flagUrl: r.logoUrl, cells: [r.played, r.won, r.lost, r.drawn, r.points, r.pct] }));
  return { league: "World Test Championship", href: "/teams/cricket", note: "live", open: true, subTables: [{ title: null, columns: ["P", "W", "L", "D", "Pts", "PCT"], rows }] };
}

async function golfBlock(): Promise<Block | null> {
  const g = await getLiveGolfMajor();
  if (!g) return null;
  const rows: SRow[] = g.rows.map((r) => ({ rank: r.pos, name: r.name, flagUrl: r.flagUrl, cells: [r.toPar, r.thru] }));
  return { league: g.name, href: "/teams/golf", note: g.live ? "live" : null, open: true, subTables: [{ title: null, columns: ["To Par", "Thru"], rows }] };
}

async function tennisBlock(): Promise<Block | null> {
  const [men, women] = await Promise.all([getLiveTennisSlam("atp"), getLiveTennisSlam("wta")]);
  if (!men && !women) return null;
  const tournament = men?.tournament ?? women?.tournament ?? "Grand Slam";
  const toSub = (d: Awaited<ReturnType<typeof getLiveTennisSlam>>, label: string): SubTable | null =>
    d ? { title: `${label} — ${d.round}`, columns: ["Score"], rows: d.matches.map((m): SRow => ({ rank: null, name: m.label, flagUrl: m.flagUrl, cells: [m.score] })) } : null;
  const subTables = [toSub(men, "Men's Singles"), toSub(women, "Women's Singles")].filter((st): st is SubTable => st !== null);
  if (subTables.length === 0) return null;
  return { league: `Tennis — ${tournament}`, href: "/teams/tennis", note: "live", open: true, subTables };
}

const _slugName = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const _ruOverride: Record<string, string> = { "Ivory Coast": "ivory-coast", "Western Samoa": "samoa" };
const _ruFlag = (n: string) => flagCdnUrl(_ruOverride[n] ?? _slugName(n));
const _crFlag = (n: string) => flagCdnUrl(_slugName(n));

async function rugbyFixturesBlock(): Promise<Block | null> {
  const f = await getRugbyFixtures();
  if (!f) return null;
  const dt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const mk = (title: string, items: RugbyMatch[], score: boolean): SubTable | null =>
    items.length ? {
      title, columns: [score ? "Score" : "Date"],
      rows: items.map((m): SRow => ({ rank: null, name: `${m.teamA} v ${m.teamB}`, flagUrl: _ruFlag(m.teamA),
        cells: [score && m.scoreA != null && m.scoreB != null ? `${m.scoreA}\u2013${m.scoreB}` : dt(m.date)] })),
    } : null;
  const subTables = [mk("Live", f.live, true), mk("Upcoming", f.upcoming, false), mk("Recent", f.recent, true)]
    .filter((st): st is SubTable => st !== null);
  if (subTables.length === 0) return null;
  return { league: "Internationals", href: "/teams/rugby-union", note: f.live.length ? "live" : "fixtures", open: true, subTables };
}

async function cricketFixturesBlock(): Promise<Block | null> {
  const f = await getCricketFixtures();
  if (!f) return null;
  const dt = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const info = (m: CricketMatch, score: boolean) =>
    score && (m.scoreA || m.scoreB) ? `${m.scoreA ?? ""} / ${m.scoreB ?? ""}`.trim() : dt(m.date);
  const mk = (title: string, items: CricketMatch[], score: boolean): SubTable | null =>
    items.length ? {
      title, columns: [score ? "Score" : "Date"],
      rows: items.map((m): SRow => ({ rank: null, name: `${m.format} \u00b7 ${m.teamA} v ${m.teamB}`, flagUrl: _crFlag(m.teamA), cells: [info(m, score)] })),
    } : null;
  const subTables = [mk("Live", f.live, true), mk("Upcoming", f.upcoming, false), mk("Recent", f.recent, true)]
    .filter((st): st is SubTable => st !== null);
  if (subTables.length === 0) return null;
  return { league: "Internationals", href: "/teams/cricket", note: f.live.length ? "live" : "fixtures", open: true, subTables };
}

// European club-competition fixtures for the standings page, fed from the unified
// api-football -> Supabase -> ISR bundle (getClubCompetitions), same source as the
// tournament hubs. Team names resolve to their canonical Lookup name, never the raw
// api name (which the retired euro-comps.json feed used to surface here).
function euroFixturesBlocks(comps: LiveComp[]): Block[] {
  const WANT: Array<[number, string, string]> = [
    [2, "champions-league", "Champions League"],
    [3, "europa-league", "Europa League"],
    [848, "conference-league", "Conference League"],
  ];
  const FIN = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
  const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
  const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const nm = (t: LiveTeamRef) => {
    const c = getFootballClubByName(t.lookup ?? "") ?? getFootballClubByName(t.name ?? "");
    return c?.cur_name ?? t.lookup ?? t.name ?? "TBD";
  };
  const byKo = (dir: number) => (a: LiveFixture, b: LiveFixture) => dir * String(a.kickoff ?? "").localeCompare(String(b.kickoff ?? ""));
  const blocks: Block[] = [];
  for (const [id, slug, label] of WANT) {
    const comp = comps.find((c) => c.league_id === id);
    if (!comp) continue;
    const fx = comp.fixtures ?? [];
    const live = fx.filter((f) => f.status && IN_PLAY.has(f.status)).sort(byKo(1));
    const recent = fx.filter((f) => f.status && FIN.has(f.status)).sort(byKo(-1)).slice(0, 12);
    const upcoming = fx.filter((f) => !(f.status && (FIN.has(f.status) || IN_PLAY.has(f.status)))).sort(byKo(1)).slice(0, 20);
    const mk = (title: string, items: LiveFixture[], score: boolean): SubTable | null =>
      items.length ? {
        title, columns: [score ? "Score" : "Date"],
        rows: items.map((f): SRow => ({ rank: null, name: `${nm(f.home)} v ${nm(f.away)}`,
          cells: [score && f.home_goals != null && f.away_goals != null ? `${f.home_goals}–${f.away_goals}` : dt(f.kickoff)] })),
      } : null;
    const subTables = [mk("Live", live, true), mk("Upcoming", upcoming, false), mk("Recent", recent, true)]
      .filter((st): st is SubTable => st !== null);
    if (!subTables.length) continue;
    blocks.push({ league: label, href: `/teams/football/tournaments/${slug}`, note: live.length ? "live" : "fixtures", open: true, subTables });
  }
  return blocks;
}

// ---- College Football (rankings only on this page) ----------------------
// The full FBS conference standings live on the /teams/cfb hub; here the block
// carries the current AP / Coaches / CFP Top 25s, resolved to canonical program
// pages. Collapsed until the 2026 kickoff (CFB_KICKOFF_UTC in lib/cfb-live),
// with the poll date always visible in the accordion note.
async function cfbBlock(): Promise<Block | null> {
  const s = await getCfbRankings();
  if (s.polls.length === 0) return null;
  const dt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

  // ONE combined comparison table instead of three stacked Top 25s (mobile:
  // ~25 rows with a slim rank column per poll, not 75 rows of scrolling).
  // Rows ordered by the lead poll (CFP when live, else AP); teams ranked only
  // in a trailing poll append underneath, sorted by their best rank.
  const COL: Record<string, string> = { cfp: "CFP", ap: "AP", coaches: "Coach" };
  type Agg = { school: string; slug: string | null; record: string; ranks: (number | null)[] };
  const bySchool = new Map<string, Agg>();
  s.polls.forEach((p, pi) => {
    for (const r of p.rows) {
      let a = bySchool.get(r.school);
      if (!a) { a = { school: r.school, slug: r.slug, record: r.record, ranks: s.polls.map(() => null) }; bySchool.set(r.school, a); }
      a.ranks[pi] = r.rank;
      if (r.record) a.record = r.record;
    }
  });
  const best = (a: Agg) => Math.min(...a.ranks.map((x) => x ?? 99));
  const teams = [...bySchool.values()].sort((a, b) =>
    (a.ranks[0] ?? 99) - (b.ranks[0] ?? 99) || best(a) - best(b) || a.school.localeCompare(b.school));
  const rows: SRow[] = teams.map((a): SRow => ({
    rank: a.ranks[0] ?? DASH, name: a.school,
    href: a.slug ? `/teams/cfb/${a.slug}` : null, crestName: a.school,
    cells: [...a.ranks.slice(1).map((x) => x ?? DASH), a.record || DASH],
  }));
  const columns = [...s.polls.slice(1).map((p) => COL[p.kind] ?? p.name), "Rec"];

  const started = cfbSeasonStarted();
  const lead = s.polls[0];
  const title = s.polls.length > 1
    ? `# = ${COL[lead.kind] ?? lead.name} \u00b7 ${[lead.week_label, dt(lead.date)].filter(Boolean).join(" \u00b7 ")}`
    : [lead.name, lead.week_label, dt(lead.date)].filter(Boolean).join(" \u00b7 ");
  const note = [COL[lead.kind] ?? lead.name, lead.week_label, dt(lead.date)].filter(Boolean).join(" \u00b7 ") || null;
  return {
    league: "College Football", href: "/teams/cfb", note,
    open: started, live: started,
    subTables: [{ title, columns, rows }],
  };
}

export default async function LiveStandingsPage() {
  const [nfl, nba, wnba, nhl, mlb, npb, mls, cfl, cfb, afl, nrl, f1, golf, tennis, wtc, rugbyFix, cricketFix, clubStandings, clubComps, wLeagues, uwclComp, wOdds] = await Promise.all([
    nflBlock(), nbaBlock(), wnbaBlock(), nhlBlock(), mlbBlock(), npbBlock(),
    mlsBlock(), cflBlock(), cfbBlock(), footyBlock("afl"), footyBlock("nrl"), f1Block(),
    golfBlock(), tennisBlock(), wtcBlock(), rugbyFixturesBlock(), cricketFixturesBlock(),
    getClubStandings(), getClubCompetitions(), getWLiveLeagues(), getWLiveCompetition("uwcl"),
    getWLiveOdds(),
  ]);
  const intlComps = await getInternationalComps();
  const unl = intlCompBlock(intlComps.find((c) => c.league_id === 5), {
    label: "UEFA Nations League", href: "/teams/national#nations-league",
    liveNote: "league phase", closedNote: "Sept–Nov 2026",
  });
  const asianCup = intlCompBlock(intlComps.find((c) => c.league_id === 7), {
    label: "AFC Asian Cup", href: "/teams/national#asian-cup",
    liveNote: "group stage", closedNote: "Jan 2027",
  });
  const wsl = wLeagueBlock(wLeagues.find((l) => l.compSlug === "wsl"), "WSL");
  const ligaF = wLeagueBlock(wLeagues.find((l) => l.compSlug === "liga-f"), "Liga F");
  const nwslW = wLeagueBlock(wLeagues.find((l) => l.compSlug === "nwsl"), "NWSL", wOdds.nwsl);
  const uwcl = uwclBlock(uwclComp);
  const euro = euroFixturesBlocks(clubComps);
  const clubById = new Map(clubStandings.map((l) => [l.league_id, l]));
  const domestics = DOMESTIC_LIVE
    .map((d) => domesticLiveBlock(clubById.get(d.id), d.label))
    .filter((b): b is Block => b !== null);
  const liber = libertadoresBlock(clubComps.find((c) => c.league_id === 13));

  // Collapse a block so the user opens it on demand (keeps a busy section tidy),
  // but preserve its in-season state as `live` so the green dot still shows.
  const collapse = (b: Block | null): Block | null => (b ? { ...b, live: b.open, open: false } : b);
  // Marquee exceptions (Ashwin, 2026-08-01): the Champions League and the Premier
  // League stay OPEN by default once their season is underway (the PL bundle
  // carries played games; CL fixtures exist from qualifying onward). NFL/NBA/NHL
  // already open via their own `open: live` logic.
  // Amendment (Ashwin, 2026-08-03): the CL stays CLOSED until the 2026-27
  // league-phase draw — Nyon, Thu 27 Aug 2026 17:00 BST (16:00 UTC), verified
  // via UEFA.com. Before then the block only carries qualifying fixtures.
  const UCL_DRAW_UTC = Date.UTC(2026, 7, 27, 16, 0, 0);
  const uclDrawn = Date.now() >= UCL_DRAW_UTC;
  const KEEP_OPEN = new Set(["Premier League", ...(uclDrawn ? ["Champions League"] : [])]);
  const collapseExcept = (b: Block | null): Block | null => {
    if (!b) return b;
    if (!KEEP_OPEN.has(b.league)) return collapse(b);
    if (b.league === "Premier League") {
      const played = b.subTables.some((st) => st.rows.some((r) => Number(r.cells[0]) > 0));
      return played ? { ...b, live: true, open: true } : collapse(b);
    }
    return { ...b, live: b.open, open: b.open };
  };

  // Ordered to match the League Hubs (lib/sportsCatalog FAMILY_ORDER), with
  // Football first for the World Cup. Olympics/Cricket/Rugby Union/Handball/
  // Volleyball have no live feed here, so they are simply absent.
  const groups: SportGroup[] = [
    // Left column = continental comps (European + Copa Libertadores), right column =
    // domestic league tables; all collapsed so the section stays tidy. Left/right
    // placement and order are enforced by FOOTBALL_LEFT/RIGHT in the normalization
    // step below.
    { sport: "Football", blocks: [collapse(liber), ...euro.map(collapseExcept), collapse(mls), ...domestics.map(collapseExcept)] },
    // International (national-team) football — Nations League and the AFC
    // Asian Cup; World Cup qualifiers and more can join the same bundle-fed
    // section. Blocks with no subTables are dropped downstream, so an
    // out-of-window tournament costs nothing here.
    { sport: "International Football", blocks: [unl, asianCup] },
    // Women's Football (below Football, all collapsed by default; feeds are the
    // same wlive bundle that powers /teams/wfootball).
    { sport: "Women's Football", blocks: [wsl, ligaF, nwslW, uwcl].map(collapse) },
    { sport: "Motorsport", blocks: [f1] },
    { sport: "Golf", blocks: [golf] },
    { sport: "Tennis", blocks: [tennis] },
    { sport: "Gridiron", blocks: [nfl, cfb, cfl] },
    { sport: "Basketball", blocks: [nba, wnba] },
    { sport: "Baseball", blocks: [mlb, npb] },
    { sport: "Hockey", blocks: [nhl] },
    { sport: "Cricket", blocks: [wtc, cricketFix] },
    { sport: "Rugby Union", blocks: [rugbyFix] },
    { sport: "Rugby League", blocks: [nrl] },
    { sport: "Aussie Rules", blocks: [afl] },
  ]
    .map((g) => {
      let blocks = g.blocks
        .filter((b): b is Block => b !== null && b.subTables.length > 0)
        .map((b) => ({ ...b, live: b.live ?? b.open }));
      if (g.sport === "Football") {
        const known = new Set([...FOOTBALL_LEFT, ...FOOTBALL_RIGHT]);
        const left = blocks.filter((b) => FOOTBALL_LEFT.includes(b.league)).sort(orderBy(FOOTBALL_LEFT));
        const right = blocks.filter((b) => FOOTBALL_RIGHT.includes(b.league)).sort(orderBy(FOOTBALL_RIGHT));
        const other = blocks.filter((b) => !known.has(b.league)); // unlisted: park at end of right, ask where it belongs
        return { sport: g.sport, blocks, columns: [left, [...right, ...other]] as [Block[], Block[]] };
      }
      return { sport: g.sport, blocks };
    })
    .filter((g) => g.blocks.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-3">
        <Link href="/sports"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span>
          Back to Sports
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Live Standings</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Live Standings</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every live league table the site tracks, gathered on one page and grouped by sport, each
          formatted to match its own league page. In-season leagues open expanded; leagues between
          seasons open collapsed with records zeroed until they restart. Green-shaded rows sit in
          playoff position today, with the green rule marking the cut; PO/Finals and title odds are
          our own simulations of each remaining schedule, refreshed daily.
        </p>
      </header>

      <HubNav items={groups.map((g) => ({ label: g.sport, href: `#${slugId(g.sport)}` }))} />

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">Standings are unavailable right now.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.sport} id={slugId(g.sport)} className="scroll-mt-24">
              <h2 className="text-lg font-semibold mb-3">{g.sport}</h2>
              {g.columns ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  <div className="space-y-3">
                    {g.columns[0].map((b) => <LeagueAccordion key={b.league} block={b} />)}
                  </div>
                  <div className="space-y-3">
                    {g.columns[1].map((b) => <LeagueAccordion key={b.league} block={b} />)}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  {g.blocks.map((b) => (
                    <div key={b.league} className={b.cols ? "lg:col-span-2" : undefined}>
                      <LeagueAccordion block={b} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
