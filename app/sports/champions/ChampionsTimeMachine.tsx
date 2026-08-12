"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { flagCdnUrl } from "@/lib/international-display";
import { competitionHref } from "@/lib/competitionLinks";

// Time machine for /sports/champions: pick any month and year and see who held
// every trophy that month. Same board as Current — tier order, the same
// Scope / Sport / Region filters, the same columns — but resolved to a date
// instead of to today.
//
// Two things put more than one name in a cell, and both are listed with the day
// each was won. A HANDOVER: the month contains a change of holder, so the old
// and new champion both appear. A SPLIT TITLE: one season with several
// champions who hold it together rather than in succession — Michigan and
// Nebraska for 1997, the NFL and AAFC champions of 1946, the AL and NL before
// the World Series existed, Six Nations 1920's three-way tie, and the NCAA
// tournament alongside the Helms and Premo-Porretta selections.
//
// Data is the static /api/champions-timeline document, fetched lazily so the
// champions page payload is untouched.

type TChampion = { name: string; canonical: string; href: string | null; metroSlug: string; season: string; won: string };
type TReign = {
  c: number; from: string; to: string | null;
  eraName?: string; tier?: number | null; tierGuide?: number | null;
  champions: TChampion[];
};
type TComp = {
  slug: string; competition: string; sport: string; scopeType: string;
  geo: string; region: string; tier: number | null; tierGuide: number | null;
  gold: boolean; first: string; last: string; live: boolean;
};
type Timeline = { generated: string; minYear: number; maxYear: number; comps: TComp[]; reigns: TReign[] };

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const SPORT_EMOJI: Record<string, string> = { Golf: "⛳", Tennis: "🎾" };
const ALL = "All";
const SCOPE_OPTS = ["International", "Continental", "Domestic"];
const REGION_ORDER = ["World", "Africa", "Asia", "Europe", "North America", "Oceania", "South America", "Other"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const NOW = new Date();
const CUR_YEAR = NOW.getUTCFullYear();
const CUR_MONTH = NOW.getUTCMonth() + 1;

const CONTINENTS = new Set(["Africa", "Asia", "Europe", "North America", "Oceania", "South America"]);
function geoRank(g: string): number {
  if (g === "World") return 0;
  if (CONTINENTS.has(g)) return 1;
  if (g === "—") return 3;
  return 2;
}
const SCOPE_RANK: Record<string, number> = { International: 0, Continental: 1, Domestic: 2 };
function sportDisplay(s: string): string {
  return s.replace(/^W /, "Women's ");
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function lastDay(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function fmtDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${MON_SHORT[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function nationSlug(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function NationFlag({ team, scopeType }: { team: string; scopeType: string }) {
  if (scopeType === "Domestic") return null;
  const url = flagCdnUrl(nationSlug(team));
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block rounded-sm object-contain flex-shrink-0 align-middle" loading="lazy" decoding="async" />;
}

type SortKey = "team" | "competition" | "scope" | "geo" | "won" | "tier";

/** A competition plus everyone holding one of its titles during the chosen month. */
// `era` is the competition's name at the time being viewed, which is the whole
// point of a time machine: August 1983 shows "VFL Premiership", not "AFL". It
// comes from the reign, not the competition, because it changes season to
// season. Older cached copies of the timeline document have no eraName, so it
// falls back to the canonical name. Where a month holds co-champions from
// different reigns the first still standing wins, which is right: they are the
// same trophy under one name in that month.
// `tier` / `tierGuide` come from the reign for the same reason as `era`: they
// are era-weighted in the ledger and change within one competition. Reading
// them off TimelineComp took whichever row sorted first in the workbook, so
// every NFL season in history rendered the modern Super Bowl's Tier 0 even
// though 1966-71 is tier 1 and the AAFC years are tier 3.
type Hit = { comp: TComp; era: string; tier: number | null; tierGuide: number | null; champions: TChampion[] };

export default function ChampionsTimeMachine() {
  const [data, setData] = useState<Timeline | null>(null);
  const [err, setErr] = useState(false);
  // Deep link: /sports/champions?asof=1990-07 opens straight on that month.
  // Read once, synchronously, in the initialiser rather than in an effect: this
  // subtree only ever mounts on the client (Current is the server-rendered tab),
  // and an effect would lose the race with the URL writer below, which React
  // StrictMode runs twice on mount and which would otherwise overwrite the very
  // parameter we came here to read.
  const initial = (() => {
    if (typeof window === "undefined") return { y: CUR_YEAR, m: CUR_MONTH };
    const p = new URLSearchParams(window.location.search).get("asof");
    const mm = p?.match(/^(\d{4})-(\d{1,2})$/);
    if (!mm) return { y: CUR_YEAR, m: CUR_MONTH };
    const y = Number(mm[1]);
    const m = Number(mm[2]);
    const ok = y >= 1800 && y <= CUR_YEAR && m >= 1 && m <= 12 && !(y === CUR_YEAR && m > CUR_MONTH);
    return ok ? { y, m } : { y: CUR_YEAR, m: CUR_MONTH };
  })();

  const [year, setYear] = useState<number>(initial.y);
  const [yearStr, setYearStr] = useState<string>(String(initial.y));
  const [month, setMonth] = useState<number>(initial.m);
  const [scope, setScope] = useState<string>(ALL);
  const [sport, setSport] = useState<string>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let alive = true;
    // no-cache = always revalidate, never serve a stale body from disk cache.
    fetch("/api/champions-timeline", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: Timeline) => { if (alive) setData(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  // Keep the URL in step without a navigation, so the view is shareable.
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("asof", `${year}-${pad2(month)}`);
    window.history.replaceState(null, "", u.toString());
  }, [year, month]);

  const minYear = data?.minYear ?? 1850;
  const commitYear = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) { setYearStr(String(year)); return; }
    const y = Math.min(Math.max(n, minYear), CUR_YEAR);
    setYear(y);
    setYearStr(String(y));
  };
  const stepMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    if (y > CUR_YEAR || (y === CUR_YEAR && m > CUR_MONTH)) { y = CUR_YEAR; m = CUR_MONTH; }
    if (y < minYear) { y = minYear; m = 1; }
    setYear(y); setYearStr(String(y)); setMonth(m);
  };

  const ms = `${year}-${pad2(month)}-01`;
  const me = `${year}-${pad2(month)}-${pad2(lastDay(year, month))}`;

  // Everyone holding a title during [ms, me]. A season's reign qualifies if it
  // overlaps the month; within it, a co-champion only counts once their own day
  // has arrived, so a split title crowned across a month boundary appears one
  // name at a time and then together.
  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    const byComp = new Map<number, TChampion[]>();
    const eraByComp = new Map<number, string>();
    const tierByComp = new Map<number, { tier: number | null; tierGuide: number | null }>();
    for (const r of data.reigns) {
      if (r.from > me) continue;
      if (r.to !== null && r.to <= ms) continue;
      // Fall back to the reign's own start if a champion carries no date. That
      // is what an older cached copy of the document looks like, and without the
      // fallback every row would be filtered out and the board would render
      // empty rather than merely imprecise.
      const shown = r.champions
        .map((ch) => (ch.won ? ch : { ...ch, won: r.from }))
        .filter((ch) => ch.won <= me);
      if (!shown.length) continue;
      const a = byComp.get(r.c);
      if (a) a.push(...shown);
      else byComp.set(r.c, [...shown]);
      // LAST reign wins, not first. Reigns arrive in chronological order per
      // competition, and in a handover month both the outgoing and incoming
      // reign are live. If that handover is also an era change — the last NFL
      // Championship giving way to the first Super Bowl — the row should read
      // as the era it has just entered, so overwrite rather than keep.
      if (r.eraName) eraByComp.set(r.c, r.eraName);
      if (r.tier != null || r.tierGuide != null) {
        tierByComp.set(r.c, { tier: r.tier ?? null, tierGuide: r.tierGuide ?? null });
      }
    }
    const out: Hit[] = [];
    for (const [ci, chs] of byComp) {
      const comp = data.comps[ci];
      const t = tierByComp.get(ci);
      out.push({
        comp,
        era: eraByComp.get(ci) || comp.competition,
        tier: t ? t.tier : comp.tier,
        tierGuide: t ? t.tierGuide : comp.tierGuide,
        champions: chs.sort((a, b) => a.won.localeCompare(b.won)),
      });
    }
    // NOTE: no longer pre-sorted by tier. The document's comps order ranks on
    // the competition's fixed head-row tier; `sorted` re-ranks on each hit's
    // era-correct tier so the board reorders when the month moves.
    return out;
  }, [data, ms, me]);

  const scopeOpts = useMemo(() => {
    const present = new Set(hits.filter((h) => (sport === ALL || h.comp.sport === sport) && (region === ALL || h.comp.region === region)).map((h) => h.comp.scopeType));
    const list = SCOPE_OPTS.filter((s) => present.has(s));
    if (scope !== ALL && !list.includes(scope)) list.unshift(scope);
    return list;
  }, [hits, sport, region, scope]);

  const sportOpts = useMemo(() => {
    const present = new Set(hits.filter((h) => (scope === ALL || h.comp.scopeType === scope) && (region === ALL || h.comp.region === region)).map((h) => h.comp.sport));
    const list = Array.from(present).sort((a, b) => sportDisplay(a).localeCompare(sportDisplay(b)));
    if (sport !== ALL && !list.includes(sport)) list.unshift(sport);
    return list;
  }, [hits, scope, region, sport]);

  const regionOpts = useMemo(() => {
    const present = new Set(hits.filter((h) => (scope === ALL || h.comp.scopeType === scope) && (sport === ALL || h.comp.sport === sport)).map((h) => h.comp.region));
    const list = REGION_ORDER.filter((x) => present.has(x));
    if (region !== ALL && !list.includes(region)) list.push(region);
    return list;
  }, [hits, scope, sport, region]);

  const filtered = useMemo(
    () => hits.filter((h) => (scope === ALL || h.comp.scopeType === scope) && (sport === ALL || h.comp.sport === sport) && (region === ALL || h.comp.region === region)),
    [hits, scope, sport, region],
  );

  const sorted = useMemo(() => {
    // Default order re-ranks on the ERA-CORRECT tier, so moving the month
    // re-sorts the board rather than only relabelling the Tier column. The
    // document's own comps order is tier-ranked by the competition's head row,
    // which is a fixed number and wrong for every month but the head's. Falls
    // back to that order as the tiebreak, keeping sport-then-name grouping.
    if (!sortKey) {
      return filtered
        .map((h, i) => ({ h, i }))
        .sort(
          (a, b) =>
            (a.h.tier ?? 99) - (b.h.tier ?? 99) ||
            (a.h.tierGuide ?? 999) - (b.h.tierGuide ?? 999) ||
            a.i - b.i,
        )
        .map((x) => x.h);
    }
    const firstChamp = (h: Hit) => h.champions[0]?.name ?? "";
    const wonAt = (h: Hit) => h.champions[h.champions.length - 1]?.won ?? "";
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      // Sort on the reign's era-correct tier, so the number that sorts is the
      // number the row displays.
      if (sortKey === "tier") cmp = (a.tier ?? 99) - (b.tier ?? 99) || (a.tierGuide ?? 999) - (b.tierGuide ?? 999);
      else if (sortKey === "won") cmp = wonAt(a).localeCompare(wonAt(b));
      else if (sortKey === "geo") cmp = geoRank(a.comp.geo) - geoRank(b.comp.geo) || a.comp.geo.localeCompare(b.comp.geo);
      else if (sortKey === "scope") cmp = (SCOPE_RANK[a.comp.scopeType] ?? 9) - (SCOPE_RANK[b.comp.scopeType] ?? 9);
      else if (sortKey === "team") cmp = firstChamp(a).localeCompare(firstChamp(b));
      else cmp = a.comp.competition.localeCompare(b.comp.competition);
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, dir]);

  function toggle(key: SortKey) {
    if (sortKey === key) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setDir(1); }
  }
  function reset() { setScope(ALL); setSport(ALL); setRegion(ALL); setSortKey(null); setDir(1); }
  const arrow = (key: SortKey) => (sortKey === key ? (dir === 1 ? " ▲" : " ▼") : "");
  const hasFilter = scope !== ALL || sport !== ALL || region !== ALL || sortKey !== null;

  function Th({ label, k, right }: { label: string; k: SortKey; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        className={`py-2 px-3 font-medium select-none cursor-pointer hover:text-[var(--accent)] ${right ? "text-right" : "text-left"}`}
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
        onClick={() => toggle(k)}
        aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
        scope="col"
      >
        {label}
        <span aria-hidden style={mono}>{arrow(k)}</span>
      </th>
    );
  }

  function Select({ label, value, onChange, opts, fmt }: { label: string; value: string; onChange: (v: string) => void; opts: string[]; fmt?: (v: string) => string }) {
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide text-[var(--text-dim)]">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <option value={ALL}>All</option>
          {opts.map((o) => <option key={o} value={o}>{fmt ? fmt(o) : o}</option>)}
        </select>
      </label>
    );
  }

  // The champion cell: a single holder is a plain name; two or more — whether a
  // split title or a mid-month handover — are stacked, each tagged with the day
  // it was won so which is which stays readable.
  function Champions({ h, bold }: { h: Hit; bold: boolean }) {
    const multi = h.champions.length > 1;
    return (
      <div className="space-y-1">
        {h.champions.map((ch, i) => (
          <div key={`${ch.canonical}-${ch.won}-${i}`} className={`leading-tight flex items-center gap-1.5 flex-wrap ${bold ? "font-bold text-base" : "font-medium text-sm"}`}>
            {SPORT_EMOJI[h.comp.sport] ? (
              <span className="text-base leading-none flex-shrink-0" aria-hidden>{SPORT_EMOJI[h.comp.sport]}</span>
            ) : (
              <CrestIcon name={ch.canonical || ch.name} />
            )}
            <NationFlag team={ch.name} scopeType={h.comp.scopeType} />
            {ch.href ? (
              <Link href={ch.href} className="hover:text-[var(--accent)] hover:underline">{ch.name}</Link>
            ) : (
              <span>{ch.name}</span>
            )}
            {multi && (
              <span className="text-[10px] font-normal text-[var(--text-dim)] tabular-nums" style={mono}>
                ({fmtDay(ch.won)})
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const selectCls = "rounded-lg border px-3 py-2 text-sm";
  const selectStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" } as const;
  const atCurrent = year === CUR_YEAR && month === CUR_MONTH;

  return (
    <div>
      {/* Month + year picker */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls} style={selectStyle}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1} disabled={year === CUR_YEAR && i + 1 > CUR_MONTH}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Year</span>
          <input
            type="text"
            inputMode="numeric"
            value={yearStr}
            onChange={(e) => setYearStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            onBlur={(e) => commitYear(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitYear((e.target as HTMLInputElement).value); }}
            aria-label="Year"
            className={`${selectCls} w-24`}
            style={{ ...selectStyle, ...mono }}
          />
        </label>
        <div className="flex items-center gap-1 pb-[1px]">
          <button type="button" onClick={() => stepMonth(-1)} className={`${selectCls} px-2`} style={selectStyle} title="One month earlier" aria-label="One month earlier">◀</button>
          <button type="button" onClick={() => stepMonth(1)} disabled={atCurrent} className={`${selectCls} px-2 disabled:opacity-40`} style={selectStyle} title="One month later" aria-label="One month later">▶</button>
          <button type="button" onClick={() => stepMonth(-12)} className={`${selectCls} text-xs`} style={selectStyle} title="One year earlier">−1y</button>
          <button type="button" onClick={() => stepMonth(12)} disabled={atCurrent} className={`${selectCls} text-xs disabled:opacity-40`} style={selectStyle} title="One year later">+1y</button>
          {!atCurrent && (
            <button type="button" onClick={() => { setYear(CUR_YEAR); setYearStr(String(CUR_YEAR)); setMonth(CUR_MONTH); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline px-2">Today</button>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-4">
        Who held every trophy in <strong className="text-[var(--text)]">{monthLabel}</strong>. A holder reigns from the
        day they won until the day the next season&apos;s champion did, so a month containing a handover lists{" "}
        <strong className="text-[var(--text)]">both</strong>, each with the date it was won. Split titles are listed in
        full rather than collapsed to the latest: co-champions of one season hold it together. A competition drops off
        the board at the end of the year it was last contested, so a dead trophy never turns up the following January.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Select label="Scope" value={scope} onChange={setScope} opts={scopeOpts} />
        <Select label="Sport" value={sport} onChange={setSport} opts={sportOpts} fmt={sportDisplay} />
        <Select label="Region" value={region} onChange={setRegion} opts={regionOpts} />
        <button type="button" onClick={reset} disabled={!hasFilter} className="rounded-lg border px-3 py-2 text-sm font-medium enabled:hover:text-[var(--accent)] enabled:hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-default" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          Reset
        </button>
        <div className="ml-auto self-center text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text)] tabular-nums" style={mono}>{sorted.length}</strong>
          {sorted.length === 1 ? " competition" : " competitions"}
        </div>
      </div>

      {err && <p className="text-sm text-[var(--text-muted)] py-8">Could not load the champions timeline. Please reload the page.</p>}
      {!err && !data && <p className="text-sm text-[var(--text-dim)] py-8">Loading the ledger…</p>}
      {data && sorted.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] py-8">
          Nothing was being held in {monthLabel} under these filters. The ledger starts in {data.minYear}.
        </p>
      )}

      {data && sorted.length > 0 && (
        <>
          {/* Mobile sort control */}
          <div className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden" style={{ backgroundColor: "var(--bg)" }}>
            <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
              <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
              <select
                value={sortKey ?? ""}
                onChange={(e) => { const label = e.target.options[e.target.selectedIndex]?.text ?? ""; toggle(e.target.value as SortKey); setAnnounce(`Sorted by ${label}`); }}
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
                style={selectStyle}
              >
                <option value="" disabled>Choose…</option>
                <option value="tier">Tier</option>
                <option value="team">Champion</option>
                <option value="competition">Competition</option>
                <option value="scope">Scope</option>
                <option value="geo">Region</option>
                <option value="won">Won</option>
              </select>
            </label>
            <button type="button" onClick={() => { if (!sortKey) return; toggle(sortKey); setAnnounce(`Sort direction: ${dir === 1 ? "descending" : "ascending"}`); }} disabled={!sortKey} aria-label={dir === 1 ? "Sort ascending" : "Sort descending"} className="rounded-lg border px-3 py-2 text-sm flex-shrink-0 disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              {dir === 1 ? "▲" : "▼"}
            </button>
            <span aria-live="polite" className="sr-only">{announce}</span>
          </div>

          {/* Mobile: one card per competition */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {/* Key on slug + era: a competition split into rival strands
                (NBA and ABA, NFL and AFL) yields two hits sharing a slug. */}
            {sorted.map((h) => (
              <div key={`${h.comp.slug}-${h.era}-card`} className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <Champions h={h} bold={h.tier != null && h.tier <= 2} />
                  {h.tier != null && (
                    <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]" style={mono}>Tier {h.tier}</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-dim)] mb-2">{sportDisplay(h.comp.sport)}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Competition</div>
                    <div>
                      <Link href={competitionHref(h.comp.slug)} className="hover:text-[var(--accent)] hover:underline">{h.era}</Link>
                      {h.comp.gold && <span aria-label="Gold Standard competition" title="Gold Standard — the apex trophy in its sport" className="ml-1 cursor-default">🥇</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Scope</div>
                    <div className="text-[var(--text-muted)]">{h.comp.scopeType || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Region</div>
                    <div className="text-[var(--text-muted)]">{h.comp.geo}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Won</div>
                    <div className="tabular-nums" style={{ ...mono, color: GOLD }}>
                      {h.champions.map((ch) => fmtDay(ch.won)).join(" · ")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs">
                  <Th label="Tier" k="tier" />
                  <Th label="Champion" k="team" />
                  <Th label="Competition" k="competition" />
                  <Th label="Scope" k="scope" />
                  <Th label="Region" k="geo" />
                  <Th label="Won" k="won" right />
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => (
                  <tr key={`${h.comp.slug}-${h.era}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 align-top tabular-nums text-[var(--text-muted)]" style={mono}>{h.tier ?? ""}</td>
                    <td className="py-2 px-3 align-top">
                      <Champions h={h} bold={h.tier != null && h.tier <= 2} />
                      <div className="text-[11px] text-[var(--text-dim)]">{sportDisplay(h.comp.sport)}</div>
                    </td>
                    <td className="py-2 px-3 align-top">
                      <Link href={competitionHref(h.comp.slug)} className="hover:text-[var(--accent)] hover:underline">{h.era}</Link>
                      {h.comp.gold && <span aria-label="Gold Standard competition" title="Gold Standard — the apex trophy in its sport" className="ml-1 cursor-default">🥇</span>}
                    </td>
                    <td className="py-2 px-3 align-top text-[var(--text-muted)]">{h.comp.scopeType || "—"}</td>
                    <td className="py-2 px-3 align-top text-[var(--text-muted)]">{h.comp.geo}</td>
                    <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: GOLD }}>
                      {h.champions.map((ch, i) => <div key={`${ch.won}-${i}`}>{fmtDay(ch.won)}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
