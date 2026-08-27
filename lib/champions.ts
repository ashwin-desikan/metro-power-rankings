import "server-only";

// Current-champions badges. SINGLE SOURCE OF TRUTH: the Champions_History
// workbook -> scripts/build-champions-history.py -> public/data/champions-history.json.
// The reigning champion of every tracked competition is the row flagged
// isCurrent in that ledger, so the badge board and the all-time honour rolls
// both read from one file (champions.json / ZoneZero_Champions.xlsx is retired).
// A team page calls getCurrentChampionships(teamName, sport) and renders
// <ChampionBadge>.
//
// Server-only. Registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type Championship = {
  sport: string;
  competition: string;
  team: string;
  year: number | null;
  dateAwarded: string | null;
  scope: string;
  scopeType: "International" | "Continental" | "Domestic" | null;
  nextAwarded: number | null;
  nextAwardedDate: string | null;
  /** True when the date was minted by the +1y rule, not published. */
  nextAwardedEstimated: boolean;
  tier: number | null;
  tierGuide: number | null;
};

// Raw champions-history row shape (subset we consume). The ledger carries the
// full all-time history; the reigning holders are the isCurrent rows.
type HistoryRow = {
  sport?: string; competition?: string; canonical?: string; champion?: string;
  year?: number | null; date?: string | null; dateAwarded?: string | null;
  scope?: string | null; scopeType?: string | null;
  nextAwardedDate?: string | null; nextAwardedEstimated?: boolean;
  tier?: number | null; tierGuide?: number | null;
  isCurrent?: boolean;
};

let _data: Championship[] | null = null;
/** "2027-02-07" -> 2027. Null for anything that is not an ISO-ish date. */
function yearOf(d: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(d ?? ""));
  return m ? Number(m[1]) : null;
}

function all(): Championship[] {
  if (_data) return _data;
  const p = join(process.cwd(), "public", "data", "champions-history.json");
  const rows: HistoryRow[] = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as HistoryRow[]) : [];
  _data = rows
    .filter((r) => r.isCurrent === true)
    .map((r): Championship => ({
      sport: r.sport ?? "",
      competition: r.competition ?? "",
      // Use the era-correct canonical name so the reigning champion resolves to
      // the current club/team page (matches how ChampionBadge is looked up).
      team: r.canonical || r.champion || "",
      year: r.year ?? null,
      dateAwarded: r.dateAwarded ?? r.date ?? null,
      scope: r.scope ?? "",
      scopeType: (r.scopeType as Championship["scopeType"]) ?? null,
      // The board renders `fmtDate(nextAwardedDate) || nextAwarded`, so the
      // year is the fallback when a next-title date is known only vaguely.
      // It was hardcoded null, which made that fallback dead code; derive it
      // from the date so a row with a date always sorts and reads sensibly.
      nextAwarded: yearOf(r.nextAwardedDate),
      nextAwardedDate: r.nextAwardedDate ?? null,
      nextAwardedEstimated: r.nextAwardedEstimated === true,
      tier: r.tier ?? null,
      tierGuide: r.tierGuide ?? null,
    }));
  return _data;
}

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
// Normalize a sport label so the workbook's Team List labels match the
// champions sheet's. The "W " (women's) prefix stays significant so men's and
// women's titles never cross-match (e.g. Spain men's Euro vs Spain women's WC).
// Cricket formats (Test/T20) collapse to "cricket"; soccer -> football.
function sportNorm(s: string): string {
  const n = norm(s);
  const w = /^w\b/.test(n) || /\bwomen/.test(n);
  let base = n.replace(/^w\s+/, "").replace(/\bwomen'?s?\b/g, "").replace(/^mens?\s+/, "").trim();
  base = base.replace(/\bsoccer\b/, "football");
  if (base.includes("cricket")) base = "cricket";
  return w ? "w " + base : base;
}

let _idx: Map<string, Championship[]> | null = null;
function idx(): Map<string, Championship[]> {
  if (_idx) return _idx;
  _idx = new Map();
  for (const c of all()) {
    const k = norm(c.team);
    (_idx.get(k) ?? _idx.set(k, []).get(k)!).push(c);
  }
  return _idx;
}

// Current championships held by a team. Pass the sport (workbook label, e.g.
// "Football", "W Football", "Basketball", "Hockey", "American Football") to
// disambiguate national teams that win across sports (e.g. United States).
export function getCurrentChampionships(team: string, sport?: string): Championship[] {
  const hits = idx().get(norm(team)) ?? [];
  if (!sport) return hits;
  const sk = sportNorm(sport);
  return hits.filter((c) => sportNorm(c.sport) === sk);
}

export function getAllChampionships(): Championship[] {
  return all();
}

// Distinct team names in the source (for a build-time validation that every
// champion resolves to a team page).
export function getChampionTeamNames(): string[] {
  return Array.from(new Set(all().map((c) => c.team)));
}
