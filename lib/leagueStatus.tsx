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

// Golf and tennis light green while a major is in play. Date windows (UTC),
// from the organisers' published calendars; keep at least the current and the
// next season here so the menu never goes dark for want of a date.
//
// 🔴 2026-09-11: the 2026 US Open window here read 25 Aug to 7 Sep while the
// tournament ran 30 Aug to 13 Sep (the main draw's 15-day format), so the
// Live Standings showed the draw and the top menu showed nothing. Ashwin:
// "if a major is going on, then that should be lit up as well for both golf
// and for tennis." A window typed from memory is a window that lies; take
// the dates from the organiser and write the source beside them.
type MajorWindow = { label: string; start: number; end: number };
const GOLF_MAJORS: MajorWindow[] = [
  // 2026
  { label: "Live - The Masters", start: Date.UTC(2026, 3, 9), end: Date.UTC(2026, 3, 12, 23, 59, 59) },
  { label: "Live - PGA Championship", start: Date.UTC(2026, 4, 14), end: Date.UTC(2026, 4, 17, 23, 59, 59) },
  { label: "Live - U.S. Open", start: Date.UTC(2026, 5, 18), end: Date.UTC(2026, 5, 21, 23, 59, 59) },
  { label: "Live - The Open", start: Date.UTC(2026, 6, 16), end: Date.UTC(2026, 6, 19, 23, 59, 59) },
  // 2027 (Sky Sports, "Golf majors in 2027", read 2026-09-11)
  { label: "Live - The Masters", start: Date.UTC(2027, 3, 8), end: Date.UTC(2027, 3, 11, 23, 59, 59) },
  { label: "Live - PGA Championship", start: Date.UTC(2027, 4, 20), end: Date.UTC(2027, 4, 23, 23, 59, 59) },
  { label: "Live - U.S. Open", start: Date.UTC(2027, 5, 17), end: Date.UTC(2027, 5, 20, 23, 59, 59) },
  { label: "Live - The Open", start: Date.UTC(2027, 6, 15), end: Date.UTC(2027, 6, 18, 23, 59, 59) },
];
const TENNIS_SLAMS: MajorWindow[] = [
  // 2026
  { label: "Live - Australian Open", start: Date.UTC(2026, 0, 12), end: Date.UTC(2026, 0, 25, 23, 59, 59) },
  { label: "Live - Roland-Garros", start: Date.UTC(2026, 4, 24), end: Date.UTC(2026, 5, 7, 23, 59, 59) },
  { label: "Live - Wimbledon", start: Date.UTC(2026, 5, 29), end: Date.UTC(2026, 6, 12, 23, 59, 59) },
  // main draw 30 Aug to 13 Sep (WTA, "US Open 2026: dates, draws, schedule", read 2026-09-11)
  { label: "Live - US Open", start: Date.UTC(2026, 7, 30), end: Date.UTC(2026, 8, 13, 23, 59, 59) },
  // 2027 (ATP calendar as reported by tennisnerd.net, read 2026-09-11)
  { label: "Live - Australian Open", start: Date.UTC(2027, 0, 17), end: Date.UTC(2027, 0, 31, 23, 59, 59) },
  { label: "Live - Roland-Garros", start: Date.UTC(2027, 4, 23), end: Date.UTC(2027, 5, 6, 23, 59, 59) },
  { label: "Live - Wimbledon", start: Date.UTC(2027, 5, 28), end: Date.UTC(2027, 6, 11, 23, 59, 59) },
  { label: "Live - US Open", start: Date.UTC(2027, 7, 29), end: Date.UTC(2027, 8, 12, 23, 59, 59) },
];
// Any sport listed here auto-lights green during its date windows (evaluated
// client-side with Date.now(), so it flips without a deploy) and shows
// "Next: ..." otherwise. Add a sport here to make its status self-updating.
const SEASON_WINDOWS: Record<string, MajorWindow[]> = {
  "/teams/golf": GOLF_MAJORS,
  "/teams/tennis": TENNIS_SLAMS,
};

// Dated phases for a league whose calendar does not follow the month grid
// below in a given year. Checked before LEAGUE_SEASONS; outside every dated
// window the month grid still answers, so a year with no dates degrades to
// the usual approximation rather than to nothing.
type DatedWindow = { label: string; tone: LeagueStatusTone; start: number; end: number };
const LEAGUE_DATES: Record<string, DatedWindow[]> = {
  // WNBA 2026 (wnba.com/keydates, read 2026-09-11): the FIBA World Cup break
  // runs 31 Aug to 16 Sep, the regular season resumes and ends 24 Sep, the
  // first round begins 27 Sep, the Finals run 17 to 31 Oct at the latest.
  // Ashwin: the break is still the season, green; amber only when the real
  // playoffs start.
  "/teams/wnba": [
    { label: "Live - Regular Season", tone: "regular", start: Date.UTC(2026, 4, 1), end: Date.UTC(2026, 8, 26, 23, 59, 59) },
    { label: "Live - Playoffs", tone: "playoffs", start: Date.UTC(2026, 8, 27), end: Date.UTC(2026, 9, 31, 23, 59, 59) },
  ],
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
  "/teams/wnba": [{ label: "Live - Regular Season", tone: "regular", months: [5, 6, 7, 8, 9] }, { label: "Live - Playoffs", tone: "playoffs", months: [10] }],
  "/teams/cfl":  [{ label: "Live - Regular Season", tone: "regular", months: [6, 7, 8, 9, 10] }, { label: "Live - Grey Cup", tone: "playoffs", months: [11] }],
  "/teams/afl":  [{ label: "Live - Regular Season", tone: "regular", months: [3, 4, 5, 6, 7, 8] }, { label: "Live - Finals", tone: "playoffs", months: [9] }],
  "/teams/nrl":  [{ label: "Live - Regular Season", tone: "regular", months: [3, 4, 5, 6, 7, 8] }, { label: "Live - Finals", tone: "playoffs", months: [9, 10] }],
  "/teams/cfb":  [{ label: "Live - Season", tone: "regular", months: [8, 9, 10, 11] }, { label: "Live - Bowls & Playoff", tone: "playoffs", months: [12, 1] }],
  "/teams/cbb":  [{ label: "Live - Regular Season", tone: "regular", months: [11, 12, 1, 2] }, { label: "Live - March Madness", tone: "playoffs", months: [3, 4] }],
  "/teams/ipl":  [{ label: "Live - IPL", tone: "regular", months: [3, 4, 5] }],
  // 🔴 CLUB FOOTBALL IS GREEN WHENEVER IT IS RUNNING (Ashwin, 2026-09-11: "there's
  // no real concept of playoffs as in other sports"). A knockout round or the MLS
  // Cup keeps its label and takes the regular tone; nothing under /teams/football
  // may carry the playoffs tone, and clubFootballStatus() enforces it once more.
  "/teams/football/leagues/mls": [{ label: "Live - Regular Season", tone: "regular", months: [2, 3, 4, 5, 6, 7, 8, 9, 10] }, { label: "Live - MLS Cup", tone: "regular", months: [11, 12] }],
  "/teams/football/leagues/premier-league": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/la-liga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/serie-a": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/bundesliga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/ligue-1": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/eredivisie": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/primeira-liga": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  "/teams/football/leagues/scottish-premiership": [{ label: "Live - Regular Season", tone: "regular", months: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5] }],
  // Rugby runs year-round (Ashwin 2026-08-02): internationals cover Feb-Nov and the
  // club season (URC/Top 14/Premiership/Champions Cup) fills Dec/Jan/Apr/May, so the
  // portal stays green through the calendar with era-appropriate labels.
  "/teams/rugby-union": [{ label: "Live - Six Nations", tone: "regular", months: [2, 3] }, { label: "Live - Internationals", tone: "regular", months: [6, 7, 8, 9, 10] }, { label: "Live - Autumn Internationals", tone: "regular", months: [11] }, { label: "Live - Club Season", tone: "regular", months: [12, 1, 4, 5] }],
  "/teams/football/tournaments/champions-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "regular", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/europa-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "regular", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/conference-league": [{ label: "Live - Qualifying", tone: "regular", months: [7, 8] }, { label: "Live - League Phase", tone: "regular", months: [9, 10, 11, 12, 1] }, { label: "Live - Knockouts", tone: "regular", months: [2, 3, 4, 5] }],
  "/teams/football/tournaments/copa-libertadores": [{ label: "Live - Group Stage", tone: "regular", months: [4, 5, 6, 7, 8] }, { label: "Live - Knockouts", tone: "regular", months: [9, 10, 11] }],
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
  const dated = LEAGUE_DATES[page];
  if (dated) {
    const now = Date.now();
    const hit = dated.find((w) => now >= w.start && now <= w.end);
    if (hit) return { label: hit.label, tone: hit.tone };
  }
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
  // Green whenever anything is running: club football has no playoff phase
  // (see LEAGUE_SEASONS), so the parent never reads amber either.
  return { label: liveTones.length + " live", tone: "regular" };
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
