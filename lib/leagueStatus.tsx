// Per-league season-status tags shown in the All Sports directory and the
// Sports nav menu. Client-safe (no server-only deps) so both the server
// /sports page and the client nav components can import it.
//
// These are curated editorial states matching the live data surfaced on the
// league hubs (regular-season standings, playoffs). The International Football
// "World Cup" tag auto-expires after the 2026 final on 2026-07-19; once past
// that date the league falls back to Offseason.

import { CHAMPION_STATUS } from "./championStatus.generated";

export type LeagueStatusTone = "regular" | "playoffs" | "worldcup" | "champion" | "offseason";
export type LeagueStatus = { label: string; tone: LeagueStatusTone };

// End of the 2026 FIFA Women's World Cup (final: 19 July 2026).
const WORLD_CUP_END = Date.UTC(2026, 6, 19, 23, 59, 59);

const STATUS_BY_PAGE: Record<string, LeagueStatus> = {
  "/teams/wfootball":  { label: "Live - Regular Season", tone: "regular" },
  "/teams/football":   { label: "Offseason", tone: "offseason" },
  "/teams/cricket":    { label: "Year-round", tone: "regular" },
  "/teams/baseball":   { label: "Next WBC 2029", tone: "offseason" },
  "/teams/olympics":   { label: "Next: LA 2028", tone: "offseason" },
  "/teams/basketball": { label: "Next WC 2027", tone: "offseason" },
  // Club football competitions (seasonal - update each year)
  "/teams/football/tournaments/club-world-cup":    { label: "Offseason", tone: "offseason" },
  // Club football domestic leagues (seasonal)
};

// Golf and tennis light green while a major is in play. 2026 windows (UTC);
// update these date ranges each season, like the other seasonal entries above.
type MajorWindow = { label: string; start: number; end: number };
const GOLF_MAJORS_2026: MajorWindow[] = [
  { label: "Live - The Masters", start: Date.UTC(2026, 3, 9), end: Date.UTC(2026, 3, 12, 23, 59, 59) },
  { label: "Live - PGA Championship", start: Date.UTC(2026, 4, 14), end: Date.UTC(2026, 4, 17, 23, 59, 59) },
  { label: "Live - U.S. Open", start: Date.UTC(2026, 5, 18), end: Date.UTC(2026, 5, 21, 23, 59, 59) },
  { label: "Live - The Open", start: Date.UTC(2026, 6, 16), end: Date.UTC(2026, 6, 19, 23, 59, 59) },
];
const TENNIS_SLAMS_2026: MajorWindow[] = [
  { label: "Live - Australian Open", start: Date.UTC(2026, 0, 12), end: Date.UTC(2026, 0, 25, 23, 59, 59) },
  { label: "Live - Roland-Garros", start: Date.UTC(2026, 4, 24), end: Date.UTC(2026, 5, 7, 23, 59, 59) },
  { label: "Live - Wimbledon", start: Date.UTC(2026, 5, 29), end: Date.UTC(2026, 6, 12, 23, 59, 59) },
  { label: "Live - US Open", start: Date.UTC(2026, 7, 25), end: Date.UTC(2026, 8, 7, 23, 59, 59) },
];
// Any sport listed here auto-lights green during its date windows (evaluated
// client-side with Date.now(), so it flips without a deploy) and shows
// "Next: ..." otherwise. Add a sport here to make its status self-updating.
const SEASON_WINDOWS: Record<string, MajorWindow[]> = {
  "/teams/golf": GOLF_MAJORS_2026,
  "/teams/tennis": TENNIS_SLAMS_2026,
};

// Recurring per-league season calendar (month-based, UTC). The in-season /
// playoff / offseason tone flips automatically every year with no manual edit
// (evaluated client-side via Date.now, so no deploy is needed to change state).
// Months are 1-12; the first window that includes the current month wins.
type MonthWindow = { label: string; tone: LeagueStatusTone; months: number[] };
const LEAGUE_SEASONS: Record<string, MonthWindow[]> = {
  // F1's calendar is ~24 individual race weekends March-December with gaps
  // between them, not a continuous fixture list -- treated as one live window
  // for the whole active stretch, same convention as every other league here
  // (e.g. Premier League stays "live" between match days too). The hub itself
  // was already marquee + status:"live" in sportsCatalog.ts, but that field is
  // vestigial (nothing reads it except the "coming" filter) -- the actual green
  // dot comes from here, and F1 was simply never added, so it never lit up.
  "/teams/f1":   [{ label: "Live - Race Season", tone: "regular", months: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  "/teams/nfl":  [{ label: "Live - Regular Season", tone: "regular", months: [9, 10, 11, 12] }, { label: "Live - Playoffs", tone: "playoffs", months: [1, 2] }],
  "/teams/nba":  [{ label: "Live - Regular Season", tone: "regular", months: [10, 11, 12, 1, 2, 3] }, { label: "Live - Playoffs", tone: "playoffs", months: [4, 5, 6] }],
  "/teams/nhl":  [{ label: "Live - Regular Season", tone: "regular", months: [10, 11, 12, 1, 2, 3] }, { label: "Live - Playoffs", tone: "playoffs", months: [4, 5, 6] }],
  "/teams/mlb":  [{ label: "Live - Regular Season", tone: "regular", months: [3, 4, 5, 6, 7, 8, 9] }, { label: "Live - Postseason", tone: "playoffs", months: [10] }],
  "/teams/wnba": [{ label: "Live - Regular Season", tone: "regular", months: [5, 6, 7, 8] }, { label: "Live - Playoffs", tone: "playoffs", months: [9, 10] }],
  "/teams/cfl":  [{ label: "Live - Regular Season", tone: "regular", months: [6, 7, 8, 9, 10] }, { label: "Live - Grey Cup", tone: "playoffs", months: [11] }],
  "/teams/afl":  [{ label: "Live - Regular Season", tone: "regular", months: [3, 4, 5, 6, 7, 8] }, { label: "Live - Finals", tone: "playoffs", months: [9] }],
  "/teams/nrl":  [{ label: "Live - Regular Season", tone: "regular", months: [3, 4, 5, 6, 7, 8] }, { label: "Live - Finals", tone: "playoffs", months: [9, 10] }],
  "/teams/cfb":  [{ label: "Live - Season", tone: "regular", months: [8, 9, 10, 11] }, { label: "Live - Bowls & Playoff", tone: "playoffs", months: [12, 1] }],
  "/teams/ipl":  [{ label: "Live - IPL", tone: "regular", months: [3, 4, 5] }],
  "/teams/football/leagues/mls": [{ label: "Live - Regular Season", tone: "regular", months: [2, 3, 4, 5, 6, 7, 8, 9, 10] }, { label: "Live - Playoffs", tone: "playoffs", months: [11, 12] }],
  "/teams/football/leagues/premier-league": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/la-liga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/serie-a": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/bundesliga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/ligue-1": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/eredivisie": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/primeira-liga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/scottish-premiership": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/rugby-union": [{ label: "Live - Six Nations", tone: "regular", months: [2, 3] }, { label: "Live - Internationals", tone: "regular", months: [6, 7, 8, 9, 10] }, { label: "Live - Autumn Internationals", tone: "regular", months: [11] }],
  "/teams/football/tournaments/champions-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "playoffs", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/europa-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "playoffs", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/conference-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "playoffs", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/copa-libertadores": [{ label: "Live - Group Stage", tone: "regular", months: [4, 5, 6, 7, 8] }, { label: "Live - Knockouts", tone: "playoffs", months: [9, 10, 11] }],
};
function monthSeasonStatus(windows: MonthWindow[]): LeagueStatus {
  const m = new Date().getUTCMonth() + 1;
  for (const w of windows) if (w.months.includes(m)) return { label: w.label, tone: w.tone };
  return { label: "Offseason", tone: "offseason" };
}
function majorsSeasonStatus(windows: MajorWindow[]): LeagueStatus {
  const now = Date.now();
  for (const w of windows) {
    if (now >= w.start && now <= w.end) return { label: w.label, tone: "regular" };
  }
  const next = windows.filter((w) => w.start > now).sort((a, b) => a.start - b.start)[0];
  if (next) {
    const m = new Date(next.start).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return { label: `Next: ${next.label.replace("Live - ", "")} ${m}`, tone: "offseason" };
  }
  return { label: "Offseason", tone: "offseason" };
}

export function leagueStatusFor(page: string | null | undefined): LeagueStatus | null {
  if (!page) return null;
  const champ = CHAMPION_STATUS[page];
  if (champ) {
    return Date.now() <= champ.until
      ? { label: champ.label, tone: "champion" }
      : { label: "Offseason", tone: "offseason" };
  }
  if (page === "/teams/national") {
    return Date.now() <= WORLD_CUP_END
      ? { label: "Live - World Cup", tone: "worldcup" }
      : { label: "Offseason", tone: "offseason" };
  }
  const seasonWindows = SEASON_WINDOWS[page];
  if (seasonWindows) return majorsSeasonStatus(seasonWindows);
  const leagueSeason = LEAGUE_SEASONS[page];
  if (leagueSeason) return monthSeasonStatus(leagueSeason);
  return STATUS_BY_PAGE[page] ?? null;
}

export type ClubFootballChild = { section: "Competitions" | "Leagues"; label: string; href: string };

// Children surfaced under the expandable Club Football row in the /sports
// console. Each child's status comes from STATUS_BY_PAGE above.
export const CLUB_FOOTBALL_CHILDREN: ClubFootballChild[] = [
  { section: "Competitions", label: "Champions League", href: "/teams/football/tournaments/champions-league" },
  { section: "Competitions", label: "Europa League", href: "/teams/football/tournaments/europa-league" },
  { section: "Competitions", label: "Conference League", href: "/teams/football/tournaments/conference-league" },
  { section: "Competitions", label: "Club World Cup", href: "/teams/football/tournaments/club-world-cup" },
  { section: "Competitions", label: "Copa Libertadores", href: "/teams/football/tournaments/copa-libertadores" },
  { section: "Leagues", label: "Premier League", href: "/teams/football/leagues/premier-league" },
  { section: "Leagues", label: "La Liga", href: "/teams/football/leagues/la-liga" },
  { section: "Leagues", label: "Serie A", href: "/teams/football/leagues/serie-a" },
  { section: "Leagues", label: "Bundesliga", href: "/teams/football/leagues/bundesliga" },
  { section: "Leagues", label: "Ligue 1", href: "/teams/football/leagues/ligue-1" },
  { section: "Leagues", label: "Eredivisie", href: "/teams/football/leagues/eredivisie" },
  { section: "Leagues", label: "Primeira Liga", href: "/teams/football/leagues/primeira-liga" },
  { section: "Leagues", label: "Scottish Premiership", href: "/teams/football/leagues/scottish-premiership" },
  { section: "Leagues", label: "MLS", href: "/teams/football/leagues/mls" },
];

// Aggregate status for the Club Football parent row: live if any child is in
// season, labelled with the live count. Lets /sports lift Club Football into
// the In-season group whenever any competition or league is active.
export function clubFootballStatus(): LeagueStatus {
  const liveTones = CLUB_FOOTBALL_CHILDREN
    .map((c) => leagueStatusFor(c.href))
    .filter((s): s is LeagueStatus => !!s && s.tone !== "offseason")
    .map((s) => s.tone);
  if (liveTones.length === 0) return { label: "Offseason", tone: "offseason" };
  const order: LeagueStatusTone[] = ["worldcup", "playoffs", "regular"];
  const tone = order.find((t) => liveTones.includes(t)) ?? "regular";
  return { label: liveTones.length + " live", tone };
}

const TONE: Record<LeagueStatusTone, { bg: string; color: string }> = {
  regular:   { bg: "rgba(16,185,129,0.16)", color: "#10b981" },
  playoffs:  { bg: "rgba(245,158,11,0.16)", color: "#f59e0b" },
  champion:  { bg: "rgba(212,175,55,0.18)", color: "#d4af37" },
  worldcup:  { bg: "rgba(168,85,247,0.16)", color: "#a855f7" },
  offseason: { bg: "rgba(120,120,140,0.18)", color: "var(--text-muted)" },
};

export function LeagueStatusTag({ status, className = "" }: { status: LeagueStatus | null; className?: string }) {
  if (!status) return null;
  const t = TONE[status.tone];
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ${className}`}
      style={{ background: t.bg, color: t.color }}
    >
      {status.label}
    </span>
  );
}
