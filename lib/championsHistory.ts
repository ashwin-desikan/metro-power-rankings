import "server-only";

// All-time champions ledger (the honour rolls). Source of truth:
// Champions_History.xlsx -> scripts/build-champions-history.py ->
// public/data/champions-history.json (6,030 rows across 87 competitions, with
// era-correct metro slugs and YYYY-MM-DD dates where known). Powers the
// All-Time toggle on /sports/champions, the per-competition roll pages
// (/sports/champions/[comp]), and the metro Championship History section.
// Server-only; registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { championTeamHref } from "./championsHub";

export type ChampHistoryRow = {
  sport: string;
  competition: string;
  compSlug: string;
  eraName: string;
  season: string;
  year: number | null;
  champion: string;
  canonical: string;
  metro: string;
  metroSlug: string;
  date: string;
  scopeType: string;
};

let _data: ChampHistoryRow[] | null = null;
function all(): ChampHistoryRow[] {
  if (_data) return _data;
  const p = join(process.cwd(), "public", "data", "champions-history.json");
  _data = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as ChampHistoryRow[]) : [];
  return _data;
}

function hrefFor(r: ChampHistoryRow): string | null {
  return championTeamHref({
    sport: r.sport,
    team: r.canonical || r.champion,
    competition: r.competition,
    scopeType: r.scopeType || null,
    year: r.year,
  });
}

const byYearDesc = (a: ChampHistoryRow, b: ChampHistoryRow) =>
  (b.year ?? 0) - (a.year ?? 0) || b.date.localeCompare(a.date);

export type CompIndexEntry = {
  competition: string;
  compSlug: string;
  sport: string;
  scopeType: string;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  current: { champion: string; canonical: string; teamHref: string | null; year: number | null } | null;
};

let _index: CompIndexEntry[] | null = null;
export function getCompetitionIndex(): CompIndexEntry[] {
  if (_index) return _index;
  const by = new Map<string, ChampHistoryRow[]>();
  for (const r of all()) {
    const a = by.get(r.compSlug);
    if (a) a.push(r);
    else by.set(r.compSlug, [r]);
  }
  const out: CompIndexEntry[] = [];
  for (const rows of by.values()) {
    const years = rows.map((r) => r.year).filter((y): y is number => y != null);
    const top = [...rows].sort(byYearDesc)[0];
    out.push({
      competition: top.competition,
      compSlug: top.compSlug,
      sport: top.sport,
      scopeType: top.scopeType,
      count: rows.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      current: { champion: top.champion, canonical: top.canonical, teamHref: hrefFor(top), year: top.year },
    });
  }
  out.sort((a, b) => a.sport.localeCompare(b.sport) || a.competition.localeCompare(b.competition));
  _index = out;
  return out;
}

export type RollRow = ChampHistoryRow & { teamHref: string | null };
export function getRoll(compSlug: string): { competition: string; sport: string; scopeType: string; rows: RollRow[] } | null {
  const rows = all().filter((r) => r.compSlug === compSlug);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => byYearDesc(a, b) || a.champion.localeCompare(b.champion));
  return {
    competition: rows[0].competition,
    sport: rows[0].sport,
    scopeType: rows[0].scopeType,
    rows: sorted.map((r) => ({ ...r, teamHref: hrefFor(r) })),
  };
}

export function getAllCompSlugs(): string[] {
  return [...new Set(all().map((r) => r.compSlug))];
}

export type MetroTitle = {
  year: number | null;
  date: string;
  sport: string;
  competition: string;
  compSlug: string;
  champion: string;
  canonical: string;
  teamHref: string | null;
};
export function getMetroTitles(metroSlug: string): MetroTitle[] {
  if (!metroSlug) return [];
  return all()
    .filter((r) => r.metroSlug === metroSlug)
    .sort(byYearDesc)
    .map((r) => ({
      year: r.year,
      date: r.date,
      sport: r.sport,
      competition: r.competition,
      compSlug: r.compSlug,
      champion: r.champion,
      canonical: r.canonical,
      teamHref: hrefFor(r),
    }));
}
