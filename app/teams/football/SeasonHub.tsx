import Link from "next/link";
import type { ReactNode } from "react";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { getFootballClubByName } from "@/lib/football";
import Hub2027Client, { type HubConf, type HubLeague, type HubGroup, type HubRow } from "./2026-27/Hub2027Client";
import RankingTable, { type RankedClub } from "./2025-26/RankingTable";
import fs from "fs";
import path from "path";
import SeasonSnapshot, { type SnapshotChampion, type SnapshotMover } from "./SeasonSnapshot";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const DASH = "—";
const num = (v: number | null | undefined): number | string => (v === null || v === undefined ? DASH : v);

type TRow = { rank: number | null; name: string; lookup: string; played: number | null; win: number | null; draw: number | null; lose: number | null; gf: number | null; ga: number | null; gd: number | null; points: number | null; champ?: boolean };
type SGroup = { label: string | null; rows: TRow[] };
type KRound = { round: string; matches: { home: string; home_lookup: string; away: string; away_lookup: string; score: string }[] };
type ContEntry = { name: string; rnd: number | null; trophy?: boolean };
type Cont = { comp: string; scope: string; section?: string; end_year?: number; entries?: ContEntry[]; table?: TRow[] | null; groups?: SGroup[] | null; knockout?: KRound[]; qualifying?: KRound[]; final?: { winner: string; winner_lookup: string; runnerup: string; score: string } | null };
type League = { league_id: number; name: string | null; country: string | null; level: number | null; confed: string; groups: SGroup[]; end_year?: number };
type Club = { rank: number; name: string; lookup: string; country: string; score: number; form: number; ped: number; tb: number; mp: number; w: number; d: number; l: number };
type Country = { rank: number; country: string; seasons: Record<string, number | null>; coef: number };
type Cup = { type: string; country: string; comp: string; winner: string; winner_lookup: string; runnerup: string; score: string };
export type Hub = { season: string; clubSeasons: string[]; note: string; clubs: Club[]; countries: Country[]; leagues: League[]; continental: Cont[]; cups: Cup[] };

function resolveClub(name: string, lookup: string): { name: string; slug: string | null } {
  const c = getFootballClubByName(lookup) ?? getFootballClubByName(name);
  return { name: c?.cur_name ?? name, slug: c?.slug ?? null };
}
const _norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
// Previous season's finishing ranks (by canonical lookup) for year-over-year deltas.
function loadPrevRanks(season: string): Map<string, number> {
  const sy = parseInt(season.slice(0, 4), 10);
  const prevSlug = `${sy - 1}-${String(sy).slice(2)}`;
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "football", `hub-${prevSlug}.json`), "utf-8")) as Hub;
    return new Map(prev.clubs.map((c) => [c.lookup, c.rank]));
  } catch { return new Map<string, number>(); }
}
function ClubCell({ name, lookup }: { name: string; lookup: string }) {
  const r = resolveClub(name, lookup);
  return (<span className="inline-flex items-center gap-1.5"><CrestIcon name={r.name} size={14} className="flex-shrink-0" />{r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}</span>);
}
type UefaTier = "Primary" | "Secondary" | "Spring-Summer";
const UEFA_TIERS: Record<string, { tier: UefaTier; rank: number }> = {
  England: { tier: "Primary", rank: 1 }, Italy: { tier: "Primary", rank: 2 }, Spain: { tier: "Primary", rank: 3 },
  Germany: { tier: "Primary", rank: 4 }, France: { tier: "Primary", rank: 5 }, Portugal: { tier: "Primary", rank: 6 },
  Netherlands: { tier: "Primary", rank: 8 }, Scotland: { tier: "Primary", rank: 19 },
  Belgium: { tier: "Secondary", rank: 7 }, Turkey: { tier: "Secondary", rank: 9 }, "Czech Republic": { tier: "Secondary", rank: 10 },
  Poland: { tier: "Secondary", rank: 11 }, Greece: { tier: "Secondary", rank: 12 }, Denmark: { tier: "Secondary", rank: 13 },
  Cyprus: { tier: "Secondary", rank: 15 }, Switzerland: { tier: "Secondary", rank: 16 }, Hungary: { tier: "Secondary", rank: 17 },
  Austria: { tier: "Secondary", rank: 20 }, Romania: { tier: "Secondary", rank: 21 }, Ukraine: { tier: "Secondary", rank: 22 },
  Croatia: { tier: "Secondary", rank: 23 }, Slovenia: { tier: "Secondary", rank: 24 }, Israel: { tier: "Secondary", rank: 25 },
  Azerbaijan: { tier: "Secondary", rank: 26 }, Slovakia: { tier: "Secondary", rank: 27 }, Bulgaria: { tier: "Secondary", rank: 28 },
  Russia: { tier: "Secondary", rank: 29 }, Serbia: { tier: "Secondary", rank: 30 }, Armenia: { tier: "Secondary", rank: 33 },
  "Bosnia-Herzegovina": { tier: "Secondary", rank: 34 }, "North Macedonia": { tier: "Secondary", rank: 42 }, Albania: { tier: "Secondary", rank: 44 },
  Malta: { tier: "Secondary", rank: 45 }, Kosovo: { tier: "Secondary", rank: 36 }, "Northern Ireland": { tier: "Secondary", rank: 50 },
  Luxembourg: { tier: "Secondary", rank: 51 }, Montenegro: { tier: "Secondary", rank: 53 }, Wales: { tier: "Secondary", rank: 54 },
  Moldova: { tier: "Secondary", rank: 39 }, "San Marino": { tier: "Secondary", rank: 55 }, Gibraltar: { tier: "Secondary", rank: 48 }, Andorra: { tier: "Secondary", rank: 49 },
  Norway: { tier: "Spring-Summer", rank: 14 }, Sweden: { tier: "Spring-Summer", rank: 18 }, Iceland: { tier: "Spring-Summer", rank: 31 },
  Ireland: { tier: "Spring-Summer", rank: 32 }, Latvia: { tier: "Spring-Summer", rank: 36 }, Kazakhstan: { tier: "Spring-Summer", rank: 37 },
  Finland: { tier: "Spring-Summer", rank: 38 }, "Faroe Islands": { tier: "Spring-Summer", rank: 41 }, Belarus: { tier: "Spring-Summer", rank: 43 },
  Lithuania: { tier: "Spring-Summer", rank: 46 }, Estonia: { tier: "Spring-Summer", rank: 48 }, Georgia: { tier: "Spring-Summer", rank: 52 },
};
const CONF_ORDER = ["UEFA · Primary", "UEFA · Secondary", "UEFA · Spring-Summer", "CONMEBOL", "CONCACAF", "AFC", "CAF"];
const PRIMARY_COUNTRIES = new Set(Object.entries(UEFA_TIERS).filter(([, v]) => v.tier === "Primary").map(([k]) => k));
// A UEFA league's section follows its season calendar, read off end_year rather than a fixed country
// map — countries like Russia, Armenia, Georgia and Moldova changed calendar mid-history. A spring-
// summer / calendar-year season sits inside the hub's FIRST year, so end_year === startYear; an autumn-
// spring season ends in the hub's SECOND year. Primary is the fixed elite eight (always autumn-spring).
function uefaTier(country: string, endYear: number | undefined, startYear: number): UefaTier {
  if (PRIMARY_COUNTRIES.has(country)) return "Primary";
  if (endYear != null) return endYear === startYear ? "Spring-Summer" : "Secondary";
  return UEFA_TIERS[country]?.tier ?? "Secondary";   // fallback only when end_year is absent
}
function buildConfs(leagues: League[], countryRank: Map<string, number>, season: string): HubConf[] {
  const startYear = parseInt(season.slice(0, 4), 10);
  // Classify each country by the calendar of its top-level (lowest level number) league so every
  // division of a country lands in the same section.
  const topEnd = new Map<string, number | undefined>(); const topLvl = new Map<string, number>();
  for (const lg of leagues) {
    if (lg.confed !== "UEFA" || !lg.country) continue;
    const lvl = lg.level ?? 99;
    if (!topLvl.has(lg.country) || lvl < topLvl.get(lg.country)!) { topLvl.set(lg.country, lvl); topEnd.set(lg.country, lg.end_year); }
  }
  const byConf = new Map<string, Map<string, HubLeague[]>>();
  for (const lg of leagues) {
    const groups: HubGroup[] = lg.groups.map((g): HubGroup => ({
      label: lg.groups.length > 1 ? g.label : null,
      rows: g.rows.map((r): HubRow => { const c = resolveClub(r.name, r.lookup); return { rank: r.rank, name: c.name, slug: c.slug, cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)], champ: r.champ }; }),
    })).filter((g) => g.rows.length > 0);
    if (!groups.length) continue;
    const conf = lg.confed === "UEFA" ? `UEFA · ${uefaTier(lg.country ?? "", topEnd.get(lg.country ?? ""), startYear)}` : lg.confed;
    const country = lg.country ?? DASH;
    if (!byConf.has(conf)) byConf.set(conf, new Map());
    const m = byConf.get(conf)!; if (!m.has(country)) m.set(country, []);
    m.get(country)!.push({ id: lg.league_id, name: lg.name ?? DASH, level: lg.level, groups, end_year: lg.end_year });
  }
  const ord = (c: string) => { const i = CONF_ORDER.indexOf(c); return i === -1 ? 99 : i; };
  return [...byConf.entries()].sort((a, b) => ord(a[0]) - ord(b[0])).map(([confederation, m]) => ({
    confederation, countries: [...m.entries()].sort((a, b) => {
      const ra = countryRank.get(a[0]) ?? UEFA_TIERS[a[0]]?.rank, rb = countryRank.get(b[0]) ?? UEFA_TIERS[b[0]]?.rank;
      if (ra != null && rb != null) return ra - rb; if (ra != null) return -1; if (rb != null) return 1; return a[0].localeCompare(b[0]);
    }).map(([country, ls]) => ({ country, leagues: ls.sort((x, y) => (x.level ?? 99) - (y.level ?? 99)) })),
  }));
}
function CTable({ table }: { table: TRow[] }) {
  const cols: [string, keyof TRow][] = [["P", "played"], ["W", "win"], ["D", "draw"], ["L", "lose"], ["GD", "gd"], ["Pts", "points"]];
  return (<div className="overflow-x-auto"><table className="w-full text-xs min-w-[300px]">
    <thead><tr className="text-left text-[var(--text-muted)]"><th className="py-1 px-1.5 font-medium text-right">#</th><th className="py-1 px-1.5 font-medium">Club</th>{cols.map(([c]) => <th key={c} className="py-1 px-1.5 font-medium text-right">{c}</th>)}</tr></thead>
    <tbody>{table.map((r, i) => (<tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
      <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
      <td className="py-1 px-1.5 font-medium whitespace-nowrap"><ClubCell name={r.name} lookup={r.lookup} /></td>
      {cols.map(([, k]) => <td key={k} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{num(r[k] as number)}</td>)}</tr>))}</tbody>
  </table></div>);
}
function GroupTables({ groups }: { groups: SGroup[] }) {
  return (<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{groups.map((g, i) => (
    <div key={i}><div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.label ?? `Group ${i + 1}`}</div><CTable table={g.rows} /></div>))}</div>);
}
function Rounds({ rounds }: { rounds: KRound[] }) {
  return (<div className="space-y-3">{rounds.map((rd) => (
    <div key={rd.round}><div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{rd.round}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">{rd.matches.map((m, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
          <span className="inline-flex items-center gap-1 truncate"><CrestIcon name={resolveClub(m.home, m.home_lookup).name} size={12} />{resolveClub(m.home, m.home_lookup).name}</span>
          <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{m.score}</span>
          <span className="inline-flex items-center gap-1 truncate justify-end">{resolveClub(m.away, m.away_lookup).name}<CrestIcon name={resolveClub(m.away, m.away_lookup).name} size={12} /></span>
        </div>))}</div></div>))}</div>);
}
const detCls = "border-t";
function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (<details className={detCls} style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold text-[var(--text-muted)]">{title}</summary><div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>{children}</div></details>);
}

// Round-by-round continental view (workbook-sourced): who was eliminated at each round.
// Rnd# 1=Final … 5=group/league phase, 6+ = qualifying. No match scores in this surface.
const CONT_ROUNDS = (season: string, section?: string): { key: string; label: string; match: (r: number | null) => boolean }[] => {
  const startY = +season.slice(0, 4);
  // The Champions League ran TWO group stages from 1999-2000 through 2002-03: 16 clubs went out in
  // the first group phase (rnd 5) and 8 in the second (rnd 4 — the slot a single-group-stage season
  // uses for the Round of 16). Relabel those two rounds for the CL in that window only; every other
  // competition and season keeps the knockout labels (the UEFA Cup was pure knockout then).
  const clTwoGroup = section === "ucl" && startY >= 1999 && startY <= 2002;
  return [
    { key: "qual", label: "Qualifying", match: (r) => r != null && r >= 6 },
    { key: "group", label: clTwoGroup ? "First group stage" : startY >= 2024 ? "League phase" : "Group stage", match: (r) => r === 5 },
    { key: "r16", label: clTwoGroup ? "Second group stage" : "Round of 16", match: (r) => r === 4 },
    { key: "qf", label: "Quarter-finals", match: (r) => r === 3 },
    { key: "sf", label: "Semi-finals", match: (r) => r === 2 },
    { key: "final", label: "Final", match: (r) => r === 1 },
  ];
};
function ContChip({ name, champ }: { name: string; champ?: boolean }) {
  const r = resolveClub(name, name);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs" style={champ ? { borderColor: "#f5b301", backgroundColor: "rgba(245,179,1,0.12)", fontWeight: 600 } : { borderColor: "var(--border)" }}>
      <CrestIcon name={r.name} size={12} className="flex-shrink-0" />
      {r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}
      {champ && <span style={{ color: "#f5b301" }}>★</span>}
    </span>
  );
}
function CompRounds({ comp, season }: { comp: Cont; season: string }) {
  const entries = comp.entries ?? [];
  const rounds = [...CONT_ROUNDS(season, comp.section)].reverse()
    .map((rd) => ({ ...rd, clubs: entries.filter((e) => rd.match(e.rnd)) }))
    .filter((rd) => rd.clubs.length > 0);
  return (
    <div className="space-y-2">
      {rounds.map((rd) => rd.key === "qual" ? (
        <details key={rd.key} className="border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] flex items-baseline gap-2">
            <span>{rd.label}</span><span className="text-[var(--text-dim)] tabular-nums">{rd.clubs.length}</span><span className="text-[var(--text-dim)]">▾</span>
          </summary>
          <div className="flex flex-wrap gap-1.5 mt-1.5">{rd.clubs.map((e, i) => <ContChip key={i} name={e.name} champ={e.trophy} />)}</div>
        </details>
      ) : (
        <div key={rd.key} className="border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1 flex items-baseline gap-2">
            <span>{rd.label}</span><span className="text-[var(--text-dim)] tabular-nums">{rd.clubs.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">{rd.clubs.map((e, i) => <ContChip key={i} name={e.name} champ={e.trophy} />)}</div>
        </div>
      ))}
    </div>
  );
}
function CompMeta({ comp }: { comp: Cont }) {
  return <span className="font-semibold text-sm">{comp.comp}{comp.end_year != null && <span className="ml-2 font-normal text-[var(--text-dim)] tabular-nums">{comp.end_year}</span>}<span className="ml-2 text-[10px] text-[var(--text-dim)] font-normal">{comp.scope}</span></span>;
}
function compWinner(comp: Cont): string | null {
  const c = comp.entries?.find((e) => e.trophy);
  return c ? resolveClub(c.name, c.name).name : null;
}
function CompSection({ comp, season }: { comp: Cont; season: string }) {
  const w = compWinner(comp);
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle}>
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-2.5 flex items-baseline justify-between gap-3">
        <CompMeta comp={comp} />
        {w && <span className="text-xs text-[var(--text-muted)]">Winner: <span className="font-semibold text-[var(--text)]">{w}</span></span>}
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--border)" }}><CompRounds comp={comp} season={season} /></div>
    </details>
  );
}
function MultiSection({ title, comps, season }: { title: string; comps: Cont[]; season: string }) {
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle}>
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-2.5 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-xs text-[var(--text-muted)]">{comps.length} competition{comps.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "var(--border)" }}>
        {comps.map((comp) => {
          const w = compWinner(comp);
          return (
            <div key={comp.comp}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <CompMeta comp={comp} />
                {w && <span className="text-xs text-[var(--text-muted)]">Winner: <span className="font-semibold text-[var(--text)]">{w}</span></span>}
              </div>
              <CompRounds comp={comp} season={season} />
            </div>
          );
        })}
      </div>
    </details>
  );
}
function ContinentalSections({ comps, season }: { comps: Cont[]; season: string }) {
  const byEndDesc = (a: Cont, b: Cont) => (b.end_year ?? 0) - (a.end_year ?? 0);
  const conmebol = comps.filter((c) => c.section === "conmebol").slice().sort(byEndDesc);
  const other = comps.filter((c) => (c.section ?? "other") === "other").slice().sort(byEndDesc);
  return (
    <div className="space-y-2.5">
      {(["ucl", "uel", "uecl"] as const).map((k) => { const c = comps.find((x) => x.section === k); return c ? <CompSection key={k} comp={c} season={season} /> : null; })}
      {conmebol.length > 0 && <MultiSection title={conmebol.map((c) => c.comp).join(" / ")} comps={conmebol} season={season} />}
      {other.length > 0 && <MultiSection title="Other competitions" comps={other} season={season} />}
    </div>
  );
}

const SEASONS_CHRON = ["1999-00", "2000-01", "2001-02", "2002-03", "2003-04", "2004-05", "2005-06", "2006-07", "2007-08", "2008-09", "2009-10", "2010-11", "2011-12", "2012-13", "2013-14", "2014-15", "2015-16", "2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];
const seasonLabel = (s: string) => (s === "2026-27" ? "2026-27 (live)" : s);
function SeasonPager({ season }: { season: string }) {
  const i = SEASONS_CHRON.indexOf(season);
  const prev = i > 0 ? SEASONS_CHRON[i - 1] : null;
  const next = i >= 0 && i < SEASONS_CHRON.length - 1 ? SEASONS_CHRON[i + 1] : null;
  const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:text-[var(--accent)] transition-colors";
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      {prev ? <Link href={`/teams/football/${prev}`} className={btn} style={cardStyle}><span className="text-[var(--text-dim)]">←</span> {seasonLabel(prev)}</Link> : <span />}
      <Link href="/teams/football/seasons" className="text-[var(--text-muted)] hover:text-[var(--accent)]">All seasons</Link>
      {next ? <Link href={`/teams/football/${next}`} className={btn} style={cardStyle}>{seasonLabel(next)} <span className="text-[var(--text-dim)]">→</span></Link> : <span />}
    </div>
  );
}

export default function SeasonHub({ hub }: { hub: Hub }) {
  const countryRank = new Map(hub.countries.map((c) => [c.country, c.rank] as const));
  const confs = buildConfs(hub.leagues, countryRank, hub.season);
  const prevRank = loadPrevRanks(hub.season);
  const deltaOf = (lookup: string, rank: number): number | null => { const p = prevRank.get(lookup); return p == null ? null : p - rank; };
  const ranked: RankedClub[] = hub.clubs.map((c) => { const r = resolveClub(c.name, c.lookup); return { rank: c.rank, name: r.name, slug: r.slug, country: c.country, mp: c.mp, w: c.w, d: c.d, l: c.l, form: c.form, ped: c.ped, tb: c.tb ?? 0, score: c.score, deltaRank: deltaOf(c.lookup, c.rank) }; });

  // ----- Season snapshot: #1 spotlight, over/under-achiever, biggest movers, league share -----
  const byRank = [...hub.clubs].sort((a, b) => a.rank - b.rank);
  const top1 = byRank[0] ?? null;
  const t1n = top1?.name ?? "", t1l = top1?.lookup ?? "";
  const wonByTop = (winner?: string | null, wl?: string | null) => !!top1 && ((winner != null && _norm(winner) === _norm(t1n)) || (wl != null && wl === t1l));
  // The international one-off comps (UEFA Super Cup, Club World Cup, Intercontinental Cup) appear in
  // BOTH the continental section and hub.cups. The continental section is the canonical surface, so
  // domesticCups strips those cross-listed trophies out of hub.cups — used below for the champion's
  // trophy badges AND the domestic Cup competitions table, so the same trophy is never shown twice
  // (e.g. "Super Cup" from continental + "UEFA Super Cup" from cups). W/D/L totals are unaffected —
  // those come from the club form aggregation, not these display arrays.
  const intlKey = (comp: string): string | null => {
    const c = comp.toLowerCase();
    if (c.includes("super cup")) return "supercup";
    if (c.includes("club world cup")) return "cwc";
    if (c.includes("intercontinental")) return "intercontinental";
    return null;
  };
  const contIntl = new Set(hub.continental.map((s) => intlKey(s.comp)).filter((k): k is string => !!k));
  const domesticCups = hub.cups.filter((c) => { const k = intlKey(c.comp); return !(k && contIntl.has(k)); });
  const trophies: string[] = [];
  for (const lg of hub.leagues) for (const g of lg.groups) for (const rr of (g.rows ?? [])) if (rr.champ && (_norm(rr.name) === _norm(t1n) || rr.lookup === t1l) && lg.name) { trophies.push(lg.name); }
  for (const sec of hub.continental) {
    if (wonByTop(sec.final?.winner, sec.final?.winner_lookup) || (sec.entries ?? []).some((e) => e.trophy && _norm(e.name) === _norm(t1n))) trophies.push(sec.comp === "UEFA Cup" ? "UEFA Cup" : sec.comp.replace(/^UEFA |^FIFA /, ""));
  }
  for (const cp of domesticCups) if (wonByTop(cp.winner, cp.winner_lookup)) trophies.push(cp.comp);
  const clSec = hub.continental.find((s) => /champions league/i.test(s.comp) && s.final);
  const clWinnerName = clSec?.final ? resolveClub(clSec.final.winner, clSec.final.winner_lookup).name : null;
  const clNote = clWinnerName
    ? (wonByTop(clSec!.final!.winner, clSec!.final!.winner_lookup) ? "Ranked #1 and won the Champions League." : `Ranked #1 in the power ranking; the Champions League went to ${clWinnerName}.`)
    : "Ranked #1 in the season power ranking.";
  const played = hub.clubs.filter((c) => c.mp >= 20);
  const over = played.reduce<Club | null>((b, c) => (b == null || (c.form - c.ped) > (b.form - b.ped) ? c : b), null);
  const under = [...hub.clubs].sort((a, b) => b.ped - a.ped).slice(0, 30).reduce<Club | null>((w, c) => (w == null || (c.form - c.ped) < (w.form - w.ped) ? c : w), null);
  // Movers, restricted to clubs that were first division (ranked) in BOTH seasons. Symmetric top-50
  // anchor keeps them to elite-relevant moves, not volatile small-league swings: the Biggest faller
  // was a top-50 club last season that fell; the Biggest riser is a club that climbed INTO the top 50
  // this season.
  let riser: Club | null = null, faller: Club | null = null, rd = 0, fd = 0;
  for (const c of hub.clubs) {
    const p = prevRank.get(c.lookup); if (p == null) continue;
    const dd = p - c.rank;
    if (c.rank <= 50 && dd > rd) { rd = dd; riser = c; }
    if (p <= 50 && dd < fd) { fd = dd; faller = c; }
  }
  const top10 = byRank.slice(0, 10);
  const shareMap = new Map<string, number>();
  for (const c of top10) shareMap.set(c.country, (shareMap.get(c.country) ?? 0) + 1);
  const leagueShare = [...shareMap.entries()].sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count }));
  // Best-of-the-rest awards: the top-ranked club from outside the season's top-5 UEFA-coefficient
  // countries, and from outside the traditional eight tracked leagues. top5 also feeds the ranking
  // table's "outside the top-5 leagues" filter.
  const top5Countries = new Set(hub.countries.filter((c) => c.rank <= 5).map((c) => c.country));
  const bestOutside5 = byRank.find((c) => !top5Countries.has(c.country)) ?? null;
  const bestOutside8 = byRank.find((c) => !PRIMARY_COUNTRIES.has(c.country)) ?? null;
  const mover = (c: Club | null, detail: string): SnapshotMover => c ? { ...resolveClub(c.name, c.lookup), detail } : null;
  const championProp: SnapshotChampion | null = top1
    ? { ...resolveClub(top1.name, top1.lookup), country: top1.country, score: top1.score, form: top1.form, ped: top1.ped, w: top1.w, d: top1.d, l: top1.l, mp: top1.mp, trophies: Array.from(new Set(trophies)) }
    : null;
  const overM = mover(over, over ? `form ${over.form.toFixed(2)} vs ped ${over.ped.toFixed(2)} · +${(over.form - over.ped).toFixed(2)}` : "");
  const underM = mover(under, under ? `form ${under.form.toFixed(2)} vs ped ${under.ped.toFixed(2)} · ${(under.form - under.ped).toFixed(2)}` : "");
  const riserM = riser ? mover(riser, `▲ ${rd} places`) : null;
  const fallerM = faller ? mover(faller, `▼ ${Math.abs(fd)} places`) : null;
  const out5M = mover(bestOutside5, bestOutside5 ? `#${bestOutside5.rank} · ${bestOutside5.country}` : "");
  const out8M = mover(bestOutside8, bestOutside8 ? `#${bestOutside8.rank} · ${bestOutside8.country}` : "");
  const nav = [{ label: "Power Ranking", href: "#clubs" }, { label: "Europe", href: "#europe" }, { label: "Leagues", href: "#leagues" }, { label: "Cups", href: "#cups" }];
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4"><Link href="/" className="hover:underline">Home</Link>{" / "}<Link href="/teams/football" className="hover:underline">Football</Link>{" / "}<span>{hub.season}</span></nav>
      <FootballHubNav current="seasons" />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.season} Club Football</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">The completed {hub.season} season: the club power ranking and UEFA country coefficients, the European and continental competitions with qualifying, group, league-phase and knockout results, every final domestic table across the confederations, and every cup final.</p>
        <p className="mt-2 text-xs text-[var(--text-dim)] tabular-nums">{hub.clubs.length} clubs ranked · {hub.leagues.length} leagues · {domesticCups.length} cup finals</p>
      </header>
      <div className="mb-6"><SeasonPager season={hub.season} /></div>
      {/* Sticky season bar: keeps the season label in view while scrolling (the full-size header
          scrolls away), and carries the jump links to each section. Sticks just below the fixed
          site header (~3.5rem tall). */}
      <div className="sticky top-14 z-30 -mx-4 mb-8 border-y px-4 py-2 backdrop-blur-md" style={{ backgroundColor: "rgba(8,8,13,0.9)", borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">{seasonLabel(hub.season)}</span>
          <span className="hidden text-[10px] uppercase tracking-widest text-[var(--text-dim)] sm:inline">Club football</span>
          <nav aria-label="On this page" className="ml-auto flex flex-wrap items-center gap-1.5">
            {nav.map((it) => (
              <a key={it.href} href={it.href} className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-[var(--text-dim)] hover:text-[var(--text)]" style={{ background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>{it.label}</a>
            ))}
          </nav>
        </div>
      </div>
      <section id="clubs" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-1">Club power ranking</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Score = 0.65 form + 0.35 five-year pedigree + current-season coefficient, less a losing-record penalty. Filter by country (ordered by coefficient rank), or switch to the country coefficient table.</p>
        <SeasonSnapshot champion={championProp} clNote={clNote} overachiever={overM} underachiever={underM} riser={riserM} faller={fallerM} bestOutside5={out5M} bestOutside8={out8M} leagueShare={leagueShare} shareTotal={top10.length} />
        <RankingTable clubs={ranked} countries={hub.countries} clubSeasons={hub.clubSeasons} top5={[...top5Countries]} />
      </section>
      <section id="europe" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-3">European &amp; continental competitions</h2>
        {hub.continental.some((c) => c.entries) ? (
          <ContinentalSections comps={hub.continental} season={hub.season} />
        ) : (
        <div className="space-y-3">{hub.continental.map((comp) => (
          <div key={comp.comp} className="rounded-xl border overflow-hidden" style={cardStyle}>
            <div className="px-4 py-2.5 flex items-baseline justify-between gap-3 flex-wrap">
              <span className="font-semibold text-sm">{comp.comp}<span className="ml-2 text-[10px] text-[var(--text-dim)] font-normal">{comp.scope}</span></span>
              {comp.final && <span className="text-xs text-[var(--text-muted)]">Winner: <span className="font-semibold text-[var(--text)]">{resolveClub(comp.final.winner, comp.final.winner_lookup).name}</span> · {comp.final.score} v {comp.final.runnerup}</span>}
            </div>
            {comp.knockout && comp.knockout.length > 0 && <Sec title="Knockout stage"><Rounds rounds={comp.knockout} /></Sec>}
            {comp.table && <Sec title="League phase"><CTable table={comp.table} /></Sec>}
            {comp.groups && <Sec title="Group stage"><GroupTables groups={comp.groups} /></Sec>}
            {comp.qualifying && comp.qualifying.length > 0 && <Sec title="Qualifying"><Rounds rounds={comp.qualifying} /></Sec>}
          </div>))}</div>
        )}
      </section>
      <section id="leagues" className="scroll-mt-24 mb-10"><h2 className="text-lg font-semibold mb-3">Final domestic tables</h2><Hub2027Client confs={confs} season={hub.season} /></section>
      <section id="cups" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-3">Cup competitions</h2>
        <div className="rounded-xl border overflow-hidden" style={cardStyle}><div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[460px]"><thead><tr className="text-left text-[var(--text-muted)]"><th className="py-2 px-2 font-medium">Competition</th><th className="py-2 px-2 font-medium">Country</th><th className="py-2 px-2 font-medium">Winner</th><th className="py-2 px-2 font-medium">Final</th></tr></thead>
          <tbody>{domesticCups.map((c) => (<tr key={`${c.comp}-${c.country}`} className="border-t" style={{ borderColor: "var(--border)" }}>
            <td className="py-1.5 px-2 whitespace-nowrap font-medium">{c.comp}<span className="ml-1.5 text-[10px] text-[var(--text-dim)]">{c.type}</span></td>
            <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-muted)]">{c.country}</td>
            <td className="py-1.5 px-2 whitespace-nowrap font-medium"><ClubCell name={c.winner} lookup={c.winner_lookup} /></td>
            <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-dim)]" style={mono}>{c.score} v {c.runnerup}</td></tr>))}</tbody></table>
        </div></div>
      </section>
      <div className="my-6 border-t pt-6" style={{ borderColor: "var(--border)" }}><SeasonPager season={hub.season} /></div>
      <p className="text-[11px] text-[var(--text-dim)]">{hub.note}</p>
    </main>
  );
}
