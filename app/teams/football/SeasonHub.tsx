import Link from "next/link";
import type { ReactNode } from "react";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import FootballHubNav from "@/app/teams/FootballHubNav";
import HubNav from "@/app/teams/HubNav";
import { getFootballClubByName } from "@/lib/football";
import Hub2027Client, { type HubConf, type HubLeague, type HubGroup, type HubRow } from "./2026-27/Hub2027Client";
import RankingTable, { type RankedClub } from "./2025-26/RankingTable";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const DASH = "—";
const num = (v: number | null | undefined): number | string => (v === null || v === undefined ? DASH : v);

type TRow = { rank: number | null; name: string; lookup: string; played: number | null; win: number | null; draw: number | null; lose: number | null; gf: number | null; ga: number | null; gd: number | null; points: number | null };
type SGroup = { label: string | null; rows: TRow[] };
type KRound = { round: string; matches: { home: string; home_lookup: string; away: string; away_lookup: string; score: string }[] };
type Cont = { comp: string; scope: string; table: TRow[] | null; groups: SGroup[] | null; knockout: KRound[]; qualifying: KRound[]; final: { winner: string; winner_lookup: string; runnerup: string; score: string } | null };
type League = { league_id: number; name: string | null; country: string | null; level: number | null; confed: string; groups: SGroup[] };
type Club = { rank: number; name: string; lookup: string; country: string; score: number; form: number; ped: number; tb: number; mp: number; w: number; d: number; l: number };
type Country = { rank: number; country: string; seasons: Record<string, number | null>; coef: number };
type Cup = { type: string; country: string; comp: string; winner: string; winner_lookup: string; runnerup: string; score: string };
export type Hub = { season: string; clubSeasons: string[]; note: string; clubs: Club[]; countries: Country[]; leagues: League[]; continental: Cont[]; cups: Cup[] };

function resolveClub(name: string, lookup: string): { name: string; slug: string | null } {
  const c = getFootballClubByName(lookup) ?? getFootballClubByName(name);
  return { name: c?.cur_name ?? name, slug: c?.slug ?? null };
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
function buildConfs(leagues: League[]): HubConf[] {
  const byConf = new Map<string, Map<string, HubLeague[]>>();
  for (const lg of leagues) {
    const groups: HubGroup[] = lg.groups.map((g): HubGroup => ({
      label: lg.groups.length > 1 ? g.label : null,
      rows: g.rows.map((r): HubRow => { const c = resolveClub(r.name, r.lookup); return { rank: r.rank, name: c.name, slug: c.slug, cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)] }; }),
    })).filter((g) => g.rows.length > 0);
    if (!groups.length) continue;
    const conf = lg.confed === "UEFA" ? `UEFA · ${UEFA_TIERS[lg.country ?? ""]?.tier ?? "Secondary"}` : lg.confed;
    const country = lg.country ?? DASH;
    if (!byConf.has(conf)) byConf.set(conf, new Map());
    const m = byConf.get(conf)!; if (!m.has(country)) m.set(country, []);
    m.get(country)!.push({ id: lg.league_id, name: lg.name ?? DASH, level: lg.level, groups });
  }
  const ord = (c: string) => { const i = CONF_ORDER.indexOf(c); return i === -1 ? 99 : i; };
  return [...byConf.entries()].sort((a, b) => ord(a[0]) - ord(b[0])).map(([confederation, m]) => ({
    confederation, countries: [...m.entries()].sort((a, b) => {
      const ra = UEFA_TIERS[a[0]]?.rank, rb = UEFA_TIERS[b[0]]?.rank;
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

const SEASONS_CHRON = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];
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
  const confs = buildConfs(hub.leagues);
  const ranked: RankedClub[] = hub.clubs.map((c) => { const r = resolveClub(c.name, c.lookup); return { rank: c.rank, name: r.name, slug: r.slug, country: c.country, mp: c.mp, w: c.w, d: c.d, l: c.l, form: c.form, ped: c.ped, tb: c.tb ?? 0, score: c.score }; });
  const nav = [{ label: "Power Ranking", href: "#clubs" }, { label: "Europe", href: "#europe" }, { label: "Leagues", href: "#leagues" }, { label: "Cups", href: "#cups" }];
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4"><Link href="/" className="hover:underline">Home</Link>{" / "}<Link href="/teams/football" className="hover:underline">Football</Link>{" / "}<span>{hub.season}</span></nav>
      <FootballHubNav current="seasons" />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.season} Club Football</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">The completed {hub.season} season: the club power ranking and UEFA country coefficients, the European and continental competitions with qualifying, group, league-phase and knockout results, every final domestic table across the confederations, and every cup final.</p>
        <p className="mt-2 text-xs text-[var(--text-dim)] tabular-nums">{hub.clubs.length} clubs ranked · {hub.leagues.length} leagues · {hub.cups.length} cup finals</p>
      </header>
      <div className="mb-6"><SeasonPager season={hub.season} /></div>
      <HubNav items={nav} />
      <section id="clubs" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-1">Club power ranking</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Score = 0.65 form + 0.35 five-year pedigree + current-season coefficient, less a losing-record penalty. Filter by country (ordered by coefficient rank), or switch to the country coefficient table.</p>
        <RankingTable clubs={ranked} countries={hub.countries} clubSeasons={hub.clubSeasons} />
      </section>
      <section id="europe" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-3">European &amp; continental competitions</h2>
        <div className="space-y-3">{hub.continental.map((comp) => (
          <div key={comp.comp} className="rounded-xl border overflow-hidden" style={cardStyle}>
            <div className="px-4 py-2.5 flex items-baseline justify-between gap-3 flex-wrap">
              <span className="font-semibold text-sm">{comp.comp}<span className="ml-2 text-[10px] text-[var(--text-dim)] font-normal">{comp.scope}</span></span>
              {comp.final && <span className="text-xs text-[var(--text-muted)]">Winner: <span className="font-semibold text-[var(--text)]">{resolveClub(comp.final.winner, comp.final.winner_lookup).name}</span> · {comp.final.score} v {comp.final.runnerup}</span>}
            </div>
            {comp.knockout.length > 0 && <Sec title="Knockout stage"><Rounds rounds={comp.knockout} /></Sec>}
            {comp.table && <Sec title="League phase"><CTable table={comp.table} /></Sec>}
            {comp.groups && <Sec title="Group stage"><GroupTables groups={comp.groups} /></Sec>}
            {comp.qualifying.length > 0 && <Sec title="Qualifying"><Rounds rounds={comp.qualifying} /></Sec>}
          </div>))}</div>
      </section>
      <section id="leagues" className="scroll-mt-24 mb-10"><h2 className="text-lg font-semibold mb-3">Final domestic tables</h2><Hub2027Client confs={confs} /></section>
      <section id="cups" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-3">Cup competitions</h2>
        <div className="rounded-xl border overflow-hidden" style={cardStyle}><div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[460px]"><thead><tr className="text-left text-[var(--text-muted)]"><th className="py-2 px-2 font-medium">Competition</th><th className="py-2 px-2 font-medium">Country</th><th className="py-2 px-2 font-medium">Winner</th><th className="py-2 px-2 font-medium">Final</th></tr></thead>
          <tbody>{hub.cups.map((c) => (<tr key={`${c.comp}-${c.country}`} className="border-t" style={{ borderColor: "var(--border)" }}>
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
