import "server-only";

// Live College Football (FBS) layer: current-season standings + AP/Coaches/CFP
// rankings from ESPN's public site API, resolved to the canonical CFB team
// database (lib/cfb) so every row links to its /teams/cfb/[slug] program page.
//
// Mirrors lib/nba-standings.ts / lib/standings.ts: fetched server-side with ISR
// (revalidate 1800, 5s timeout), shaped defensively, empty snapshot on failure.
// Consumed by app/teams/cfb/page.tsx (standings + rankings) and
// app/sports/standings/page.tsx (rankings only).
//
// Server-only — scripts/check-client-imports.mjs should list @/lib/cfb-live.

import { getCfbTeamForName } from "./cfb";

const STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/football/college-football/standings";
const RANKINGS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";
const REVALIDATE_SECONDS = 1800;

// ESPN `team.location` -> canonical CFB team name (lib/cfb data.json names).
// Everything else resolves via getCfbTeamForName(location) directly. A school
// that resolves to nothing renders unlinked (never guess a wrong program).
const CANONICAL_OVERRIDE: Record<string, string> = {
  "Miami": "Miami FL",
  "Miami (OH)": "Miami OH",
  "Ole Miss": "Mississippi",
  "UTSA": "TX-San Antonio",
  "UCF": "Central Florida",
  "Sam Houston": "Sam Houston State",
  "Hawai'i": "Hawaii",
  "App State": "Appalachian State",
  "Middle Tennessee": "Middle Tennessee State",
  "San José State": "San Jose State",
};

export type CfbStandingRow = {
  school: string;          // display name (canonical name when resolved, else ESPN location)
  slug: string | null;     // /teams/cfb/[slug] when resolved
  espn_id: string;
  overall: string;         // "12-2"
  conf: string;            // "7-1"
  wins: number;
  losses: number;
  conf_pct: number;
  points_for: number;
  points_against: number;
  streak: string | null;
  seed: number | null;
};

export type CfbConference = {
  name: string;            // "Big Ten Conference"
  short: string;           // "Big Ten"
  power4: boolean;
  rows: CfbStandingRow[];
};

export type CfbStandingsSnapshot = {
  season_year: number;
  fetched_at: string;
  conferences: CfbConference[];
  source_label: string;
};

export type CfbRankRow = {
  rank: number;
  prev: number | null;     // 0/absent = NR last week
  school: string;
  slug: string | null;
  record: string;          // "12-2"
  first_place_votes: number;
  trend: string;           // "-", "+2", ...
};

export type CfbPoll = {
  kind: "cfp" | "ap" | "coaches";
  name: string;            // "CFP Rankings" / "AP Top 25" / "Coaches Poll"
  date: string | null;     // ISO from ESPN
  week_label: string | null; // "Preseason", "Week 6", "Final Rankings"
  rows: CfbRankRow[];
};

export type CfbRankingsSnapshot = {
  fetched_at: string;
  polls: CfbPoll[];        // CFP first when present, then AP, then Coaches
  latest_date: string | null;
  source_label: string;
};

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null;
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown, fb = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fb);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { "User-Agent": "rankings-citizen-of-nowhere/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function resolve(location: string, fallback: string): { school: string; slug: string | null } {
  const name = CANONICAL_OVERRIDE[location] ?? location;
  const t = getCfbTeamForName(name) ?? (fallback ? getCfbTeamForName(fallback) : null);
  return t ? { school: t.name, slug: t.slug } : { school: location || fallback, slug: null };
}

// ---- standings ----------------------------------------------------------

const POWER4: RegExp[] = [/southeastern/i, /big ten/i, /big 12/i, /atlantic coast/i];
const isPower4 = (name: string) => POWER4.some((re) => re.test(name));
const confShort = (name: string) =>
  name
    .replace(/southeastern conference/i, "SEC")
    .replace(/atlantic coast conference/i, "ACC")
    .replace(/\s*conference\s*$/i, "")
    .trim() || name;

export async function getCfbStandings(): Promise<CfbStandingsSnapshot> {
  const raw = await fetchJson(STANDINGS_URL);
  const root = asObj(raw);
  const empty: CfbStandingsSnapshot = {
    season_year: 0, fetched_at: new Date().toISOString(), conferences: [], source_label: "",
  };
  if (!root) return empty;

  const season = asObj(root.season);
  const seasonYear = asNum(season?.year, 0) || asNum(root.season, 0);

  const conferences: CfbConference[] = [];
  for (const childRaw of asArr(root.children)) {
    const child = asObj(childRaw);
    if (!child) continue;
    const name = asStr(child.name);
    const entries = asArr(asObj(child.standings)?.entries);
    const rows: CfbStandingRow[] = [];
    for (const entryRaw of entries) {
      const entry = asObj(entryRaw);
      const team = asObj(entry?.team);
      if (!entry || !team) continue;
      const location = asStr(team.location);
      const { school, slug } = resolve(location, asStr(team.shortDisplayName));

      let overall = "", conf = "", wins = 0, losses = 0, confPct = 0;
      let pf = 0, pa = 0, streak: string | null = null, seed: number | null = null;
      for (const sRaw of asArr(entry.stats)) {
        const s = asObj(sRaw);
        if (!s) continue;
        const sName = asStr(s.name);
        const sType = asStr(s.type);
        const display = asStr(s.displayValue);
        const value = asNum(s.value, 0);
        if (sType === "total" || sName === "overall") overall = display || overall;
        else if (sType === "vsconf") conf = display || conf;
        else if (sName === "wins") wins = value;
        else if (sName === "losses") losses = value;
        else if (sName === "leagueWinPercent") confPct = value;
        else if (sName === "pointsFor") pf = value;
        else if (sName === "pointsAgainst") pa = value;
        else if (sName === "streak") streak = display || null;
        else if (sName === "playoffSeed") seed = value || null;
      }
      // Overall W-L from the record string (the numeric wins/losses mirror it,
      // but the string is authoritative and carries ties if they ever return).
      const m = overall.match(/^(\d+)-(\d+)/);
      if (m) { wins = Number(m[1]); losses = Number(m[2]); }

      rows.push({
        school, slug, espn_id: asStr(team.id),
        overall: overall || `${wins}-${losses}`, conf: conf || "",
        wins, losses, conf_pct: confPct,
        points_for: pf, points_against: pa, streak, seed,
      });
    }
    if (rows.length === 0) continue;
    // Conference order: conference record pct, then overall wins.
    rows.sort((a, b) => b.conf_pct - a.conf_pct || b.wins - a.wins || a.school.localeCompare(b.school));
    conferences.push({ name, short: confShort(name), power4: isPower4(name), rows });
  }

  // Power 4 first (SEC, Big Ten, Big 12, ACC), then the rest A-Z, Independents last.
  const p4rank = (n: string) => { const i = POWER4.findIndex((re) => re.test(n)); return i === -1 ? 99 : i; };
  conferences.sort((a, b) => {
    const ia = p4rank(a.name), ib = p4rank(b.name);
    if (ia !== ib) return ia - ib;
    const indA = /independent/i.test(a.name) ? 1 : 0, indB = /independent/i.test(b.name) ? 1 : 0;
    if (indA !== indB) return indA - indB;
    return a.name.localeCompare(b.name);
  });

  return {
    season_year: seasonYear,
    fetched_at: new Date().toISOString(),
    conferences,
    source_label: "ESPN FBS standings",
  };
}

// ---- rankings -----------------------------------------------------------

function pollKind(name: string): CfbPoll["kind"] | null {
  if (/playoff|cfp/i.test(name)) return "cfp";
  if (/\bap\b/i.test(name)) return "ap";
  if (/coach/i.test(name)) return "coaches";
  return null;
}
const POLL_ORDER: CfbPoll["kind"][] = ["cfp", "ap", "coaches"];
const POLL_LABEL: Record<CfbPoll["kind"], string> = {
  cfp: "CFP Rankings", ap: "AP Top 25", coaches: "Coaches Poll",
};

export async function getCfbRankings(): Promise<CfbRankingsSnapshot> {
  const raw = await fetchJson(RANKINGS_URL);
  const root = asObj(raw);
  const empty: CfbRankingsSnapshot = {
    fetched_at: new Date().toISOString(), polls: [], latest_date: null, source_label: "",
  };
  if (!root) return empty;

  const polls: CfbPoll[] = [];
  for (const rRaw of asArr(root.rankings)) {
    const r = asObj(rRaw);
    if (!r) continue;
    const kind = pollKind(asStr(r.name) + " " + asStr(r.shortName) + " " + asStr(r.type));
    if (!kind) continue; // FCS polls etc.
    const occurrence = asObj(r.occurrence);
    const rows: CfbRankRow[] = [];
    for (const eRaw of asArr(r.ranks)) {
      const e = asObj(eRaw);
      const team = asObj(e?.team);
      if (!e || !team) continue;
      const location = asStr(team.location);
      const { school, slug } = resolve(location, asStr(team.nickname));
      rows.push({
        rank: asNum(e.current, 0),
        prev: asNum(e.previous, 0) || null,
        school, slug,
        record: asStr(e.recordSummary),
        first_place_votes: asNum(e.firstPlaceVotes, 0),
        trend: asStr(e.trend) || "-",
      });
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.rank - b.rank);
    polls.push({
      kind,
      name: POLL_LABEL[kind],
      date: asStr(r.date) || null,
      week_label: asStr(occurrence?.displayValue) || null,
      rows: rows.slice(0, 25),
    });
  }
  // De-dupe by kind (keep first = ESPN's current occurrence), order CFP, AP, Coaches.
  const seen = new Set<string>();
  const unique = polls.filter((p) => !seen.has(p.kind) && seen.add(p.kind));
  unique.sort((a, b) => POLL_ORDER.indexOf(a.kind) - POLL_ORDER.indexOf(b.kind));

  const latest = unique.map((p) => p.date).filter(Boolean).sort().pop() ?? null;
  return {
    fetched_at: new Date().toISOString(),
    polls: unique,
    latest_date: latest,
    source_label: "ESPN CFB rankings",
  };
}

// 2026 season kickoff (Week 0 opens Thursday 27 Aug 2026 UTC). The Live
// Standings College Football block stays collapsed until this instant, then
// auto-opens (evaluated at render; the page revalidates every 120s).
// Update each season, like the other seasonal windows in lib/leagueStatus.
export const CFB_KICKOFF_UTC = Date.UTC(2026, 7, 27);
export const cfbSeasonStarted = (): boolean => Date.now() >= CFB_KICKOFF_UTC;
