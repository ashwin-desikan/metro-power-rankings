import type { Metadata } from "next";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

import { getCurrentNflStandings } from "@/lib/standings";
import { getCurrentNbaStandings } from "@/lib/nba-standings";
import { getCurrentNhlStandings } from "@/lib/nhl-standings";
import { getCurrentMlbStandings } from "@/lib/mlb-standings";
import { getCurrentMlsStandings } from "@/lib/mls-standings";
import { getNwslStandings } from "@/lib/nwsl-standings";
import { getCurrentWnbaStandings } from "@/lib/wnba-standings";
import { getLiveCflStandings } from "@/lib/cflStandings";
import { getLiveF1Standings } from "@/lib/f1Standings";
import { getNpbStandings } from "@/lib/npbStandings";
import { getWc2026LiveStandings, mergeWc2026Live, fetchWc2026Bundle, getWc2026LiveScores, mergeWc2026Knockout } from "@/lib/wc2026Standings";
import { getFootyLiveStandings } from "@/lib/_footyStandings";
import { getLiveGolfMajor } from "@/lib/golfLeaderboard";
import { getLiveTennisSlam } from "@/lib/tennisDraw";
import { f1ConstructorCrestName } from "@/lib/f1Crest";
import { getWtcStandings } from "@/lib/wtcStandings";

import { getAllFranchises as nflFranchises, logoUrlFor as nflLogo, monogramFor as nflMono } from "@/lib/nfl";
import { getAllFranchises as nbaFranchises, logoUrlFor as nbaLogo, monogramFor as nbaMono } from "@/lib/nba";
import { getAllFranchises as mlbFranchises, logoUrlFor as mlbLogo, monogramFor as mlbMono } from "@/lib/mlb";
import { getAllFranchises as nhlFranchises, logoUrlFor as nhlLogo, monogramFor as nhlMono } from "@/lib/nhl";
import { getWnbaFranchiseByTeamName, monogramFor as wnbaMono } from "@/lib/wnba";
import { getAllAflFranchises } from "@/lib/afl";
import { getAllNrlFranchises } from "@/lib/nrl";
import { getWClubByName } from "@/lib/wfootball";
import { getFootballClubByName } from "@/lib/football";
import { getWorldCup2026 } from "@/lib/international";
import { flagCdnUrl, displayNameForTeam } from "@/lib/international-display";

export const revalidate = 1800;

const PATH = "/sports/standings";
const TITLE = "Live Standings";
const DESC =
  "Every live league table the site tracks, in one place: the four North American majors, MLS, NWSL, WNBA, CFL, NPB, AFL, NRL, F1 and the 2026 World Cup. Refreshed through each season.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// ---- shared model -------------------------------------------------------
type Cell = string | number;
type Mono = { text: string; bg: string; fg: string };
type SRow = { rank: number | string | null; name: string; href?: string | null; logoUrl?: string | null; flagUrl?: string | null; crestName?: string | null; monogram?: Mono | null; cells: Cell[] };
type SubTable = { title: string | null; columns: string[]; rows: SRow[] };
type Block = { league: string; href: string | null; note: string | null; open: boolean; subTables: SubTable[]; cols?: boolean };
type SportGroup = { sport: string; blocks: Block[] };

const DASH = "—";
const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const pct3 = (v: number | null | undefined): Cell => (v === null || v === undefined ? DASH : v.toFixed(3).replace(/^0/, ""));
const num = (v: number | null | undefined): Cell => (v === null || v === undefined ? DASH : v);

function inSeasonFromGames(gamesPlayed: number[], fullSeason: number): boolean {
  if (gamesPlayed.length === 0) return false;
  return Math.max(...gamesPlayed) > 0 && Math.min(...gamesPlayed) < fullSeason;
}

function buildBlock<T>(opts: {
  league: string; href: string; note: string | null; open: boolean;
  items: T[]; columns: string[];
  sort: (a: T, b: T) => number;
  groups: { title: string; pick: (t: T) => boolean }[];
  row: (t: T, i: number) => SRow;
}): Block | null {
  if (opts.items.length === 0) return null;
  const all = opts.items.slice().sort(opts.sort).map((t, i) => opts.row(t, i));
  const grouped: SubTable[] = opts.groups
    .map((g) => ({ title: g.title, columns: opts.columns, rows: opts.items.filter(g.pick).slice().sort(opts.sort).map((t, i) => opts.row(t, i)) }))
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
    return <img src={r.logoUrl} alt="" aria-hidden width={15} height={15} className="object-contain flex-shrink-0" style={{ width: 15, height: 15 }} />;
  }
  if (r.flagUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.flagUrl} alt="" aria-hidden width={18} height={13} className="object-contain flex-shrink-0" style={{ width: 18, height: 13 }} />;
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
        <span className="font-semibold text-sm">{block.league}</span>
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[320px]">
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
                    <tr key={`${r.name}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
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
  const live = inSeasonFromGames(teams.map((t) => t.games_played), 17);
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
  });
}

async function nbaBlock(): Promise<Block | null> {
  const s = await getCurrentNbaStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(nbaFranchises().map((f) => [f.canonical, f]));
  const live = inSeasonFromGames(teams.map((t) => t.games_played), 82);
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
  });
}

async function nhlBlock(): Promise<Block | null> {
  const s = await getCurrentNhlStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(nhlFranchises().map((f) => [f.canonical, f]));
  const live = inSeasonFromGames(teams.map((t) => t.games_played), 82);
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
  });
}

async function mlbBlock(): Promise<Block | null> {
  const s = await getCurrentMlbStandings();
  const teams = Object.values(s.by_canonical);
  if (teams.length === 0) return null;
  const fr = new Map(mlbFranchises().map((f) => [f.canonical, f]));
  const live = inSeasonFromGames(teams.map((t) => t.games_played), 162);
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
      cells: live ? [t.wins, t.losses, pct3(t.win_pct), gb.get(t.canonical) ?? DASH] : [DASH, DASH, DASH, DASH] };
  };
  return buildBlock({
    league: "MLB", href: "/teams/mlb", note: live ? s.source_label : "Offseason", open: live,
    items: teams, columns: ["W", "L", "PCT", "GB"],
    sort: live ? (a, b) => b.win_pct - a.win_pct || b.wins - a.wins : (a, b) => nameOf(a).localeCompare(nameOf(b)),
    groups: [{ title: "American League", pick: (t) => leagueOf(t) === "AL" }, { title: "National League", pick: (t) => leagueOf(t) === "NL" }],
    row,
  });
}

async function wnbaBlock(): Promise<Block | null> {
  const s = await getCurrentWnbaStandings();
  if (s.rows.length === 0) return null;
  const live = inSeasonFromGames(s.rows.map((t) => t.games_played), 44);
  const row = (t: (typeof s.rows)[number], i: number): SRow => {
    const f = getWnbaFranchiseByTeamName(t.name); const m = f ? wnbaMono(f) : null;
    return { rank: live ? i + 1 : null, name: f?.name ?? t.name, href: f ? `/teams/wnba/${f.slug}` : null,
      crestName: f?.name ?? t.name, monogram: m ? { text: m.abbr, bg: m.color, fg: "#fff" } : null,
      cells: live ? [t.wins, t.losses, pct3(t.win_pct)] : [DASH, DASH, DASH] };
  };
  return buildBlock({
    league: "WNBA", href: "/teams/wnba", note: live ? s.source_label : "Offseason", open: live,
    items: s.rows, columns: ["W", "L", "PCT"],
    sort: live ? (a, b) => b.win_pct - a.win_pct : (a, b) => a.name.localeCompare(b.name),
    groups: [{ title: "Eastern Conference", pick: (t) => t.conf === "Eastern" }, { title: "Western Conference", pick: (t) => t.conf === "Western" }],
    row,
  });
}

// ---- everything else ----------------------------------------------------

async function mlsBlock(): Promise<Block | null> {
  const s = await getCurrentMlsStandings();
  return buildBlock({
    league: "MLS", href: "/teams/football", note: s.source_label, open: true,
    items: s.rows, columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"],
    sort: (a, b) => b.points - a.points || b.gd - a.gd,
    groups: [{ title: "Eastern Conference", pick: (t) => t.conf === "Eastern" }, { title: "Western Conference", pick: (t) => t.conf === "Western" }],
    row: (t, i) => { const c = getFootballClubByName(t.name); const nm = c?.cur_name ?? t.name; return { rank: i + 1, name: nm, href: c ? `/teams/football/${c.slug}` : null, crestName: nm, cells: [t.played, t.wins, t.draws, t.losses, t.gf, t.ga, t.gd, t.points] }; },
  });
}

async function nwslBlock(): Promise<Block | null> {
  const s = await getNwslStandings();
  if (s.rows.length === 0) return null;
  const rows: SRow[] = s.rows
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((t) => { const c = getWClubByName(t.name); const nm = c?.name ?? t.name; return { rank: t.rank, name: nm, href: c ? `/teams/wfootball/clubs/${c.slug}` : null, crestName: nm, cells: [t.played, t.wins, t.draws, t.losses, t.gf, t.ga, t.gd, t.points] }; });
  return { league: "NWSL", href: "/teams/wfootball", note: s.source_label, open: true, subTables: [{ title: null, columns: ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"], rows }] };
}

async function npbBlock(): Promise<Block | null> {
  const s = await getNpbStandings();
  if (!s || (s.central.length === 0 && s.pacific.length === 0)) return null;
  const toRows = (rows: typeof s.central): SRow[] =>
    rows.map((r) => ({ rank: r.rank, name: r.name, href: r.slug ? `/teams/baseball/npb/${r.slug}` : null, crestName: r.name, cells: [r.win, r.lose, r.draw, r.pct, r.gamesBehind] }));
  const subTables: SubTable[] = [
    { title: "Central League", columns: ["W", "L", "T", "PCT", "GB"], rows: toRows(s.central) },
    { title: "Pacific League", columns: ["W", "L", "T", "PCT", "GB"], rows: toRows(s.pacific) },
  ].filter((st) => st.rows.length > 0);
  return { league: "NPB", href: "/teams/baseball/npb", note: `${s.year}`, open: true, subTables };
}

function wc2026KnockoutSubTables(wc: ReturnType<typeof mergeWc2026Live>): SubTable[] {
  const ko = wc.knockout ?? {};
  const fmtDate = (d: string | null): string => {
    if (!d) return DASH;
    const dt = new Date(d + "T00:00:00Z");
    return Number.isNaN(dt.getTime())
      ? DASH
      : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Third Place Game", "Final"];
  return ROUND_ORDER.map((rn): SubTable | null => {
    const matches = (ko[rn] ?? []).filter((m) => m.team_slug && m.opp_slug);
    if (matches.length === 0) return null;
    const rows = matches.map((m): SRow => {
      const tName = m.team_slug ? displayNameForTeam(m.team_slug, m.team_cur_name) : m.team_cur_name;
      const oName = m.opp_slug ? displayNameForTeam(m.opp_slug, m.opp_cur_name) : m.opp_cur_name;
      const result =
        m.played && m.team_score !== null && m.opp_score !== null
          ? `${m.team_score}–${m.opp_score}${m.penalty_kicks ? " (pens)" : ""}`
          : fmtDate(m.date);
      return {
        rank: null,
        name: `${tName} v ${oName}`,
        href: m.team_slug ? `/teams/national/${m.team_slug}` : null,
        flagUrl: m.team_slug ? flagCdnUrl(m.team_slug) : null,
        cells: [result],
      };
    });
    return { title: rn, columns: ["Result"], rows };
  }).filter((s): s is SubTable => s !== null);
}

async function wc2026Block(): Promise<Block | null> {
  // Read the live bundle from GitHub raw (ISR), matching /teams/national, so the
  // standings hub reflects the daily Action's data commits (knockout scores,
  // recomputed standings) without needing a Vercel rebuild. Falls back to the
  // build-time bundle if the fetch fails.
  const bundle = await fetchWc2026Bundle(getWorldCup2026());
  if (!bundle) return null;
  const live = await getWc2026LiveStandings();
  const scores = await getWc2026LiveScores();
  // Overlay the live ESPN scoreboard knockout scores (as /teams/national does)
  // so in-flight and just-finished knockout results appear here too, not only
  // the results already committed into the wc2026.json bundle.
  const wc = mergeWc2026Knockout(mergeWc2026Live(bundle, live), scores);

  // Follow the tournament into its active phase: once the bracket is populated
  // (group stage complete), show the knockout rounds rather than the now-final
  // group tables. Falls back to group tables during the group stage.
  const r32 = wc.knockout?.["Round of 32"] ?? [];
  if (r32.some((m) => !!m.team_slug && !!m.opp_slug)) {
    const subTables = wc2026KnockoutSubTables(wc);
    if (subTables.length > 0) {
      return { league: "FIFA World Cup 2026", href: "/teams/national", note: "knockout stage", open: true, subTables };
    }
  }

  const keys = Object.keys(wc.group_stage).sort();
  const subTables = keys.map((k): SubTable => {
    const rows = wc.group_stage[k]
      .slice()
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd)
      .map((t): SRow => ({
        rank: null,
        name: t.slug ? displayNameForTeam(t.slug, t.cur_name) : t.cur_name,
        href: t.slug ? `/teams/national/${t.slug}` : null,
        flagUrl: t.slug ? flagCdnUrl(t.slug) : null,
        cells: [t.matches, t.w, t.d, t.l, t.gd, t.pts],
      }));
    return { title: /^group/i.test(k) ? k : `Group ${k}`, columns: ["P", "W", "D", "L", "GD", "Pts"], rows };
  });
  const isLive = !!live && live.rows.length > 0;
  return { league: "FIFA World Cup 2026", href: "/teams/national", note: isLive ? "live" : null, open: true, subTables };
}

async function cflBlock(): Promise<Block | null> {
  const s = await getLiveCflStandings(new Date().getFullYear());
  if (!s) return null;
  const order = ["East", "West"];
  const sorted = s.divisions.slice().sort((a, b) => order.indexOf(a.division) - order.indexOf(b.division));
  const subTables = sorted.map((d): SubTable => ({
    title: `${d.division} Division`,
    columns: ["GP", "W", "L", "T", "Pts", "PF", "PA"],
    rows: d.rows.map((t): SRow => ({ rank: null, name: t.name, href: t.slug ? `/teams/cfl/${t.slug}` : null, crestName: t.name, cells: [t.gp, t.w, t.l, t.t, t.pts, t.pf, t.pa] })),
  })).filter((st) => st.rows.length > 0);
  if (subTables.length === 0) return null;
  return { league: "CFL", href: "/teams/cfl", note: `${s.year}`, open: true, subTables };
}

async function footyBlock(league: "afl" | "nrl"): Promise<Block | null> {
  const s = await getFootyLiveStandings(league);
  if (!s || s.rows.length === 0) return null;
  const franchises = league === "afl" ? getAllAflFranchises() : getAllNrlFranchises();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const cols = league === "afl" ? ["P", "W", "L", "D", "For", "Agst", "Pts"] : ["P", "W", "D", "L", "For", "Agst", "Pts"];
  const rows: SRow[] = s.rows.map((t) => {
    const f = t.slug ? bySlug.get(t.slug) : undefined;
    const name = f?.name ?? t.name;
    return {
      rank: t.rank, name,
      href: t.slug ? `/teams/${league}/${t.slug}` : null,
      crestName: name,
      monogram: f ? { text: f.abbr, bg: f.color, fg: "#fff" } : null,
      cells: league === "afl"
        ? [num(t.played), num(t.w), num(t.l), num(t.d), num(t.pf), num(t.pa), num(t.pts)]
        : [num(t.played), num(t.w), num(t.d), num(t.l), num(t.pf), num(t.pa), num(t.pts)],
    };
  });
  return { league: league.toUpperCase(), href: `/teams/${league}`, note: `${s.year}`, open: true, subTables: [{ title: null, columns: cols, rows }] };
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
  return { league: "Formula 1", href: "/teams/f1", note: s.source === "espn" ? "live" : `${s.season}`, open: true, cols: true, subTables: [drivers, constructors] };
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

export default async function LiveStandingsPage() {
  const [nfl, nba, wnba, nhl, mlb, npb, mls, nwsl, wc, cfl, afl, nrl, f1, golf, tennis, wtc] = await Promise.all([
    nflBlock(), nbaBlock(), wnbaBlock(), nhlBlock(), mlbBlock(), npbBlock(),
    mlsBlock(), nwslBlock(), wc2026Block(), cflBlock(), footyBlock("afl"), footyBlock("nrl"), f1Block(),
    golfBlock(), tennisBlock(), wtcBlock(),
  ]);

  // Ordered to match the League Hubs (lib/sportsCatalog FAMILY_ORDER), with
  // Football first for the World Cup. Olympics/Cricket/Rugby Union/Handball/
  // Volleyball have no live feed here, so they are simply absent.
  const groups: SportGroup[] = [
    { sport: "Football", blocks: [wc, mls, nwsl] },
    { sport: "Motorsport", blocks: [f1] },
    { sport: "Golf", blocks: [golf] },
    { sport: "Tennis", blocks: [tennis] },
    { sport: "Gridiron", blocks: [nfl, cfl] },
    { sport: "Basketball", blocks: [nba, wnba] },
    { sport: "Baseball", blocks: [mlb, npb] },
    { sport: "Hockey", blocks: [nhl] },
    { sport: "Cricket", blocks: [wtc] },
    { sport: "Rugby League", blocks: [nrl] },
    { sport: "Aussie Rules", blocks: [afl] },
  ]
    .map((g) => ({ sport: g.sport, blocks: g.blocks.filter((b): b is Block => b !== null && b.subTables.length > 0) }))
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
          seasons open collapsed with records zeroed until they restart.
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                {g.blocks.map((b) => (
                  <div key={b.league} className={b.cols ? "lg:col-span-2" : undefined}>
                    <LeagueAccordion block={b} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
