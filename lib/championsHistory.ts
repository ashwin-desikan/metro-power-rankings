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
import { championTeamHref, getChampionsWithLinks } from "./championsHub";

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
  tierGuide: number | null;
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

// Per-competition metadata (tier, geo, region, canonical scope) reused from the
// current-champions board so the All-Time index sorts and filters identically.
type CompMeta = { tier: number | null; geo: string; region: string; scopeType: string };
let _meta: Map<string, CompMeta> | null = null;
function metaFor(competition: string): CompMeta {
  if (!_meta) {
    _meta = new Map();
    for (const c of getChampionsWithLinks()) {
      _meta.set(c.competition, { tier: c.tier ?? null, geo: c.geo, region: c.region, scopeType: c.scopeType ?? "" });
    }
  }
  return _meta.get(competition) ?? { tier: null, geo: "—", region: "Other", scopeType: "" };
}

export type CompIndexEntry = {
  competition: string;
  compSlug: string;
  sport: string;
  scopeType: string;
  geo: string;
  region: string;
  tier: number | null;
  tierGuide: number | null;
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
    const m = metaFor(top.competition);
    out.push({
      competition: top.competition,
      compSlug: top.compSlug,
      sport: top.sport,
      scopeType: m.scopeType || top.scopeType,
      geo: m.geo,
      region: m.region,
      tier: m.tier,
      tierGuide: top.tierGuide ?? null,
      count: rows.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      current: { champion: top.champion, canonical: top.canonical, teamHref: hrefFor(top), year: top.year },
    });
  }
  // Default order: by tier ascending (apex = 0 first; untiered last), then
  // sport, then competition. The client list filters on top of this order.
  out.sort(
    (a, b) =>
      (a.tier ?? 99) - (b.tier ?? 99) ||
      (a.tierGuide ?? 999) - (b.tierGuide ?? 999) ||
      a.sport.localeCompare(b.sport) ||
      a.competition.localeCompare(b.competition),
  );
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
  eraName: string;
  compSlug: string;
  champion: string;
  canonical: string;
  scopeType: string;
  tier: number | null;
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
      eraName: r.eraName,
      compSlug: r.compSlug,
      champion: r.champion,
      canonical: r.canonical,
      scopeType: r.scopeType,
      tier: metaFor(r.competition).tier,
      teamHref: hrefFor(r),
    }));
}

// Country championship history. Pass the country's metro slugs (club / domestic
// titles join by metro) and the set of national-team names to attribute
// (the country plus its constituents, e.g. UK -> England/Scotland/Wales/
// Northern Ireland/Great Britain, so the home nations roll up to the UK page).
export function getCountryTitles(metroSlugs: string[], nationNames: string[]): MetroTitle[] {
  const metros = new Set(metroSlugs.filter(Boolean));
  const nations = new Set(nationNames.map((n) => n.toLowerCase().trim()).filter(Boolean));
  const seen = new Set<string>();
  const out: ChampHistoryRow[] = [];
  for (const r of all()) {
    const byMetro = r.metroSlug && metros.has(r.metroSlug);
    const isIntl = r.scopeType === "International" || r.scopeType === "Continental";
    const byNation = isIntl && (nations.has(r.champion.toLowerCase().trim()) || nations.has(r.canonical.toLowerCase().trim()));
    if (!byMetro && !byNation) continue;
    const key = `${r.competition}|${r.year}|${r.champion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort(byYearDesc);
  return out.map((r) => ({
    year: r.year,
    date: r.date,
    sport: r.sport,
    competition: r.competition,
    eraName: r.eraName,
    compSlug: r.compSlug,
    champion: r.champion,
    canonical: r.canonical,
    scopeType: r.scopeType,
    tier: metaFor(r.competition).tier,
    teamHref: hrefFor(r),
  }));
}

// Former top-flight rugby clubs: defunct clubs that won a top rugby competition
// (Top 14 / Premiership / Champions Cup) and no longer field a side, surfaced as
// "Former Top 14 club" cards on their metro page (mirrors the NCAA Former D-I
// pattern). A club counts as "former" when its name is not among the active
// rugby clubs in the Team List. Driven by champions-history so the era-correct
// metro the user assigned (e.g. Vienne -> Lyon, Narbonne -> Beziers) is used.
const RUGBY_TOPFLIGHT: Record<string, string> = {
  "Top 14": "Top 14",
  "PREM Rugby": "Premiership",
  "Champions Cup": "Champions Cup",
};
const TOPFLIGHT_RANK = ["Top 14", "PREM Rugby", "Champions Cup"];
function chNorm(x: string): string {
  return x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
let _activeRugby: Set<string> | null = null;
function activeRugby(): Set<string> {
  if (_activeRugby) return _activeRugby;
  _activeRugby = new Set();
  const p = join(process.cwd(), "public", "data", "sports", "all-teams.json");
  if (existsSync(p)) {
    const at = JSON.parse(readFileSync(p, "utf-8")) as Array<{ team?: string; name?: string; sport?: string }>;
    for (const t of at) {
      if ((t.sport ?? "").toLowerCase().includes("rugby")) _activeRugby.add(chNorm(t.team ?? t.name ?? ""));
    }
  }
  return _activeRugby;
}

export type FormerTopFlight = {
  club: string;
  comp: string;                                 // primary comp label for the card header
  comps: { comp: string; titles: number; years: string[] }[]; // one chip per competition won
  firstYear: number | null;
  lastYear: number | null;
  href: string | null;
};

export function getFormerTopFlightForMetro(metroSlug: string): FormerTopFlight[] {
  if (!metroSlug) return [];
  const act = activeRugby();
  const byClub = new Map<string, ChampHistoryRow[]>();
  for (const r of all()) {
    if (r.metroSlug !== metroSlug) continue;
    if (!RUGBY_TOPFLIGHT[r.competition]) continue;
    if (act.has(chNorm(r.canonical)) || act.has(chNorm(r.champion))) continue; // still active -> not "former"
    const k = r.canonical || r.champion;
    const a = byClub.get(k);
    if (a) a.push(r); else byClub.set(k, [r]);
  }
  const out: FormerTopFlight[] = [];
  for (const [club, rows] of byClub) {
    const present = new Set(rows.map((r) => r.competition));
    const primary = TOPFLIGHT_RANK.find((c) => present.has(c)) ?? rows[0].competition;
    // one chip per competition won, ranked (Top 14 / Premiership / Champions Cup)
    const yearsByComp = new Map<string, string[]>();
    for (const r of rows) {
      const a = yearsByComp.get(r.competition) ?? [];
      a.push(r.season || String(r.year ?? ""));
      yearsByComp.set(r.competition, a);
    }
    const comps = TOPFLIGHT_RANK.filter((c) => yearsByComp.has(c)).map((c) => ({
      comp: RUGBY_TOPFLIGHT[c] ?? c,
      titles: yearsByComp.get(c)!.length,
      years: yearsByComp.get(c)!,
    }));
    const yrs = rows.map((r) => r.year).filter((y): y is number => y != null);
    out.push({
      club,
      comp: RUGBY_TOPFLIGHT[primary] ?? primary,
      comps,
      firstYear: yrs.length ? Math.min(...yrs) : null,
      lastYear: yrs.length ? Math.max(...yrs) : null,
      href: championTeamHref({ sport: "Rugby Union", team: club, competition: primary, scopeType: "Domestic", year: null }),
    });
  }
  out.sort((a, b) => (b.lastYear ?? 0) - (a.lastYear ?? 0) || a.club.localeCompare(b.club));
  return out;
}
