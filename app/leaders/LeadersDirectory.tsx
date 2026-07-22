"use client";

// Master directory of every current leader we track — sovereign states,
// constituents/territories, and intergovernmental organisations. Three lenses:
//   Current     — today's officeholders, one row per entity.
//   Time machine — who held each office in a chosen month/year. A mid-month
//                  handover returns BOTH holders (e.g. Jan 2025 = Biden + Trump),
//                  and the sovereign resolves by date too (realms share the
//                  British monarch, so Jan 2022 correctly shows Elizabeth II).
//   All-time    — every leader in an entity's history, one row per term.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { flagUrl, flagSrcSet, flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { activeIn, dkey, resolveWindow, shortRole, type HistRow } from "@/lib/leaderRules";
import type { LeaderEntity } from "@/lib/leadersAll";
import { BALLOT_OF } from "@/lib/electionLeaderLinks";

const CONTINENTS = [
  "All", "Europe", "North America", "Asia", "South America", "Africa",
  "Oceania", "Intergovernmental",
];
const TYPES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sovereign", label: "Sovereign" },
  { key: "territory", label: "Territory" },
  { key: "org", label: "Organisation" },
  { key: "defunct", label: "Defunct" },
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NOW = new Date();
const CUR_YEAR = NOW.getUTCFullYear();
const CUR_MONTH = NOW.getUTCMonth() + 1;

type Mode = "current" | "asof" | "alltime";
type Line = { name: string; role: string; start?: string | null; currentOnly?: boolean };
type Resolved = { primaries: Line[]; seconds: Line[] } | null;

function pad4(y: number) { return String(y).padStart(4, "0"); }
function lastDay(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Resolve an entity over a month window [ms, me].
function resolveAsOf(
  e: LeaderEntity,
  ms: string,
  me: string,
  monarchs: HistRow[],
): Resolved {
  let base: Resolved = null;
  if (e.hasHistory) {
    const { primaries, seconds } = resolveWindow(e.history, e.slug, ms, me);
    if (primaries.length) {
      base = {
        primaries: primaries.map((p) => ({ name: p.n, role: shortRole(p.r), start: p.s })),
        seconds: seconds.map((s) => ({ name: s.n, role: shortRole(s.r) })),
      };
    }
  } else if (e.current && (!e.current.since || e.current.since <= me)) {
    // Current-only entity: we lack succession, so we can only surface today's
    // holder, and only once the window is on/after they took office.
    base = {
      primaries: [{ name: e.current.name, role: e.current.role, start: e.current.since ?? null, currentOnly: true }],
      seconds: e.current.second ? [{ name: e.current.second.name, role: e.current.second.role }] : [],
    };
  }
  // Realms share the British monarch — resolve the sovereign by date regardless
  // of what the entity's own file carries.
  if (base && e.realm) {
    const reigning = activeIn(monarchs, ms, me);
    if (reigning.length) base.seconds = reigning.map((m) => ({ name: m.n, role: shortRole(m.r) }));
  }
  return base;
}

// Historical name of an entity at a date (Russia→Soviet Union, Germany→Nazi
// Germany, ...). Falls back to the entity's present-day name.
// Modern-territory chips: links to the present-day country/countries whose land
// now covers this defunct entity's territory (curated, max 3; public/data/
// leaders/_modern-territory.json). These are NOT heirs or successors — separate
// modern states that happen to occupy the same ground. Shown wherever a defunct
// entity's name appears.
function TerritoryChips({ e }: { e: LeaderEntity }) {
  if (!e.modernTerritory || e.modernTerritory.length === 0) return null;
  return (
    <span className="ml-1 text-[10px] text-[var(--text-dim)]">
      territory now in{" "}
      {e.modernTerritory.map((s, i) => (
        <span key={s.slug}>
          {i > 0 ? ", " : ""}
          <Link href={`/countries/${s.slug}`} className="text-[var(--accent)] hover:underline">{s.name}</Link>
        </span>
      ))}
    </span>
  );
}

function nameAt(e: LeaderEntity, dateISO: string): string {
  if (!e.nameHistory) return e.name;
  const p = e.nameHistory.find(
    (x) => (x.start == null || dkey(x.start) <= dkey(dateISO)) && (x.end == null || dkey(x.end) >= dkey(dateISO)),
  );
  return p ? p.name : e.name;
}

type FlagView = { url: string; srcSet?: string } | "hourglass" | null;

// Flag to show for an entity at a date. Renamed entities use their era flag
// when it matches a usable current flag (West Germany → German flag), otherwise
// an hourglass marks a bygone state; defunct states always get the hourglass.
function flagFor(e: LeaderEntity, dateISO: string | null): FlagView {
  if (dateISO && e.nameHistory) {
    const p = e.nameHistory.find(
      (x) => (x.start == null || dkey(x.start) <= dkey(dateISO)) && (x.end == null || dkey(x.end) >= dkey(dateISO)),
    );
    if (p) {
      if (p.flag) return { url: flagUrlByCode(p.flag), srcSet: flagSrcSetByCode(p.flag) };
      if (p.end == null) {
        const u = flagUrl(e.slug);
        return u ? { url: u, srcSet: flagSrcSet(e.slug) ?? undefined } : null;
      }
      return "hourglass";
    }
  }
  const u = flagUrl(e.slug);
  if (u) return { url: u, srcSet: flagSrcSet(e.slug) ?? undefined };
  return e.type === "defunct" ? "hourglass" : null;
}

function FlagView({ view }: { view: FlagView }) {
  if (view === "hourglass")
    return <span className="inline-block mr-2 align-[-2px] text-xs" aria-hidden="true">⌛</span>;
  if (!view) return null;
  return (
    <img
      src={view.url}
      srcSet={view.srcSet}
      alt=""
      aria-hidden="true"
      width={20}
      height={15}
      loading="lazy"
      className="inline-block mr-2 rounded-sm ring-1 ring-white/10 align-[-2px] shrink-0"
    />
  );
}

function fmtScore(n: number | null): string {
  return n == null ? "" : n.toFixed(1);
}

export default function LeadersDirectory({
  entities,
  monarchTimeline,
}: {
  entities: LeaderEntity[];
  monarchTimeline: HistRow[];
}) {
  const [mode, setMode] = useState<Mode>("current");
  const [yearStr, setYearStr] = useState<string>(String(CUR_YEAR));
  const [era, setEra] = useState<"CE" | "BC">("CE");
  const [month, setMonth] = useState<number>(CUR_MONTH);
  const [continent, setContinent] = useState<string>("All");
  const [type, setType] = useState<string>("all");
  const [org, setOrg] = useState<string>("All");
  const [entitySlug, setEntitySlug] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<"score" | "power" | "name" | "since">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [announce, setAnnounce] = useState("");

  // Free-typed year; only coerced when we build the query window, so the field
  // never fights the user mid-keystroke.
  const yearNum = (() => {
    const n = parseInt(yearStr, 10);
    return Number.isFinite(n) && n >= 1 && n <= (era === "BC" ? 9999 : CUR_YEAR) ? n : CUR_YEAR;
  })();
  const sign = era === "BC" ? "-" : "";
  // Step the Time machine one year forward/back in TIME (BC counts down going forward;
  // 1 BC steps forward to AD 1 and flips the era).
  const stepYear = (dir: 1 | -1) => {
    let y = yearNum;
    let e = era;
    if (e === "BC") {
      y -= dir; // forward in time = smaller BC year
      if (y < 1) { e = "CE"; y = 1; }
    } else {
      y += dir;
      if (y < 1) { e = "BC"; y = 1; }
      if (y > CUR_YEAR) y = CUR_YEAR;
    }
    if (y > 9999) y = 9999;
    setEra(e);
    setYearStr(String(y));
  };

  const ms = `${sign}${pad4(yearNum)}-${String(month).padStart(2, "0")}-01`;
  const me = `${sign}${pad4(yearNum)}-${String(month).padStart(2, "0")}-${String(lastDay(yearNum, month)).padStart(2, "0")}`;
  const midMonth = `${sign}${pad4(yearNum)}-${String(month).padStart(2, "0")}-15`;

  // Share of world power, lazy-loaded from the Power Atlas dataset (/power-atlas).
  const [powerMap, setPowerMap] = useState<Record<string, Record<string, number>> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/data/power-history.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.byYear) return;
        const m: Record<string, Record<string, number>> = {};
        for (const [yr, arr] of Object.entries(d.byYear as Record<string, Array<{ slug: string; share: number | null }>>)) {
          const row: Record<string, number> = {};
          for (const r of arr) if (r.share != null) row[r.slug] = r.share;
          m[yr] = row;
        }
        setPowerMap(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const POWER_MAX_YEAR = 2026;
  const relYear = mode === "asof"
    ? (era === "CE" && yearNum >= 1500 && yearNum <= POWER_MAX_YEAR ? yearNum : null)
    : POWER_MAX_YEAR;
  const powerShare = (slug: string): number | null =>
    relYear && powerMap ? (powerMap[String(relYear)]?.[slug] ?? null) : null;
  const fmtPct = (n: number | null): string => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
  // Sensible default sort per mode: power in the time machine, metro score when current.
  useEffect(() => {
    if (mode === "asof") setSortKey("power");
    else if (mode === "current") setSortKey("score");
  }, [mode]);

  const orgOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) {
      for (const o of e.orgs) s.add(o);
      if (mode !== "current") for (const o of Object.keys(e.orgSpans ?? {})) s.add(o);
    }
    return ["All", ...Array.from(s).sort()];
  }, [entities, mode]);

  // Dropdown order: live countries (by score), then defunct (most recent first), then orgs.
  const entityOptions = useMemo(() => {
    const rank = (e: LeaderEntity) => (e.type === "org" ? 2 : e.current ? 0 : 1);
    const endYear = (e: LeaderEntity) => {
      const m = e.yearRange?.match(/(\d+)(\s*BC)?\s*$/);
      if (!m) return 0;
      const y = parseInt(m[1], 10);
      return m[2] ? -y : y;
    };
    return [...entities].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) {
        const av = a.scoreTotal, bv = b.scoreTotal;
        if (av == null && bv == null) return a.name.localeCompare(b.name);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv !== av ? bv - av : a.name.localeCompare(b.name);
      }
      if (ra === 1) {
        const d = endYear(b) - endYear(a);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [entities]);

  const historyCount = useMemo(() => entities.filter((e) => e.hasHistory).length, [entities]);

  function toggleSort(key: "score" | "power" | "name" | "since") {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }
  function arrow(key: "score" | "power" | "name" | "since") {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  function passesFilters(e: LeaderEntity): boolean {
    if (entitySlug !== "all") return e.slug === entitySlug;
    if (continent !== "All" && e.continent !== continent) return false;
    if (type !== "all" && e.type !== type) return false;
    if (org !== "All") {
      const span = e.orgSpans?.[org];
      if (mode === "asof" && span) {
        if (span.s != null && dkey(span.s) > dkey(me)) return false;
        if (span.e != null && dkey(span.e) < dkey(ms)) return false;
      } else if (!e.orgs.includes(org)) return false;
    }
    return true;
  }

  function cmpPower(a: LeaderEntity, b: LeaderEntity): number {
    const av = powerShare(a.slug), bv = powerShare(b.slug);
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a.name.localeCompare(b.name);
    return sortDir === "asc" ? av - bv : bv - av;
  }

  function cmpScore(a: LeaderEntity, b: LeaderEntity): number {
    const av = a.scoreTotal, bv = b.scoreTotal;
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a.name.localeCompare(b.name);
    return sortDir === "asc" ? av - bv : bv - av;
  }

  // ── Current / Time-machine rows (one per entity) ──────────────────────────
  const entityRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entities
      .filter(passesFilters)
      .map((e) => ({ e, r: mode === "asof" ? resolveAsOf(e, ms, me, monarchTimeline) : null }))
      .filter(({ e, r }) => {
        if (mode === "current" && !e.current) return false;
        if (mode === "asof" && !r) return false;
        if (q) {
          const names = mode === "asof" && r
            ? [...r.primaries, ...r.seconds].map((x) => x.name).join(" ")
            : `${e.current?.name ?? ""} ${e.current?.second?.name ?? ""}`;
          if (!`${e.name} ${names}`.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    list.sort((a, b) => {
      const ao = a.e.type === "org" ? 1 : 0, bo = b.e.type === "org" ? 1 : 0;
      if (ao !== bo) return ao - bo;
      if (sortKey === "power") return cmpPower(a.e, b.e);
      if (sortKey === "score") return cmpScore(a.e, b.e);
      if (sortKey === "name") {
        const c = a.e.name.localeCompare(b.e.name);
        return sortDir === "asc" ? c : -c;
      }
      // since
      const av = dkey((mode === "asof" ? a.r?.primaries[0]?.start : a.e.current?.since) ?? null);
      const bv = dkey((mode === "asof" ? b.r?.primaries[0]?.start : b.e.current?.since) ?? null);
      if (av === bv) return a.e.name.localeCompare(b.e.name);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [entities, mode, ms, me, monarchTimeline, continent, type, org, entitySlug, search, sortKey, sortDir, powerMap, relYear]);

  // ── All-time rows (one per historical term) ───────────────────────────────
  const allTimeRows = useMemo(() => {
    if (mode !== "alltime" || (entitySlug === "all" && !search.trim())) return [];
    const q = search.trim().toLowerCase();
    type Row = { e: LeaderEntity; n: string; r: string; s: string | null; en: string | null };
    const rows: Row[] = [];
    for (const e of entities) {
      if (!passesFilters(e)) continue;
      if (e.history.length) {
        for (const h of e.history) rows.push({ e, n: h.n, r: h.r, s: h.s, en: h.e });
      } else if (e.current) {
        rows.push({ e, n: e.current.name, r: e.current.role, s: e.current.since ?? null, en: null });
      }
    }
    const filtered = q ? rows.filter((x) => `${x.e.name} ${x.n}`.toLowerCase().includes(q)) : rows;
    filtered.sort((a, b) => {
      const ao = a.e.type === "org" ? 1 : 0, bo = b.e.type === "org" ? 1 : 0;
      if (ao !== bo) return ao - bo;
      const sc = cmpScore(a.e, b.e);
      if (sc !== 0) return sc;
      // within an entity, newest term first
      return dkey(b.s) - dkey(a.s);
    });
    return filtered;
  }, [entities, mode, continent, type, org, entitySlug, search, sortDir]);

  const regionLabel = (e: LeaderEntity) =>
    e.type === "org" ? "Org" : e.type === "territory" ? `${e.parentName ?? ""} (terr.)` : e.continent ?? "";

  const selectCls =
    "px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)]";

  return (
    <div className="space-y-4">
      {/* Mode + time controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-[var(--border)] overflow-hidden">
          {(["current", "asof", "alltime"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-sm font-medium transition-all ${mode === m ? "bg-[var(--accent)] text-black" : "bg-[var(--bg-card)] text-[var(--text-muted)]"}`}
            >{m === "current" ? "Current" : m === "asof" ? "Time machine" : "All-time"}</button>
          ))}
        </div>
        {mode === "asof" ? (
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={yearStr}
              onChange={(e) => setYearStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="Year"
              className={`${selectCls} w-24`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
            <div className="inline-flex flex-col rounded-md border border-[var(--border)] overflow-hidden">
              <button
                type="button"
                onClick={() => stepYear(1)}
                className="px-1.5 leading-none text-[10px] py-[3px] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                title="One year later"
                aria-label="One year later"
              >&#9650;</button>
              <button
                type="button"
                onClick={() => stepYear(-1)}
                className="px-1.5 leading-none text-[10px] py-[3px] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors border-t border-[var(--border)]"
                title="One year earlier"
                aria-label="One year earlier"
              >&#9660;</button>
            </div>
            <button
              type="button"
              onClick={() => setEra(era === "CE" ? "BC" : "CE")}
              className={selectCls}
              title="Toggle BC / CE"
            >{era === "BC" ? "BC" : "CE"}</button>
          </div>
        ) : null}
      </div>

      {mode === "asof" ? (
        <p className="text-xs text-[var(--text-dim)] leading-relaxed">
          Full succession is loaded for {historyCount} offices — those resolve to the exact
          officeholder(s) for the month, and a mid-month handover shows both. The rest carry only a
          current snapshot, so they appear (marked <span className="text-[var(--text-muted)]">now</span>)
          from the date the incumbent took office. For Commonwealth realms the sovereign resolves by date.
        </p>
      ) : null}
      {mode === "alltime" && entitySlug === "all" ? (
        <p className="text-xs text-[var(--text-dim)] leading-relaxed">
          Pick a country or organisation from the dropdown below, or search by name, to see its full leader history.
        </p>
      ) : null}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select value={entitySlug} onChange={(e) => setEntitySlug(e.target.value)} className={`${selectCls} max-w-[16rem]`}>
            <option value="all">All countries &amp; orgs</option>
            <optgroup label="Countries">
              {entityOptions.filter((e) => e.type !== "org" && e.current).map((e) => (
                <option key={`${e.type}:${e.slug}`} value={e.slug}>{e.name}{e.yearRange ? ` (${e.yearRange})` : ""}</option>
              ))}
            </optgroup>
            <optgroup label="Defunct states">
              {entityOptions.filter((e) => e.type !== "org" && !e.current).map((e) => (
                <option key={`${e.type}:${e.slug}`} value={e.slug}>{e.name}{e.yearRange ? ` (${e.yearRange})` : ""}</option>
              ))}
            </optgroup>
            <optgroup label="Organisations">
              {entityOptions.filter((e) => e.type === "org").map((e) => (
                <option key={`${e.type}:${e.slug}`} value={e.slug}>{e.name}{e.yearRange ? ` (${e.yearRange})` : ""}</option>
              ))}
            </optgroup>
          </select>
          <select value={org} onChange={(e) => setOrg(e.target.value)} className={selectCls} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {orgOptions.map((o) => <option key={o} value={o}>{o === "All" ? "Any membership" : o}</option>)}
          </select>
        </div>
        <div className={`flex flex-wrap gap-2 ${entitySlug !== "all" ? "opacity-40 pointer-events-none" : ""}`}>
          {CONTINENTS.map((c) => (
            <button
              key={c}
              onClick={() => setContinent(c)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${continent === c ? "bg-[var(--accent)] text-black" : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]"}`}
            >{c}</button>
          ))}
        </div>
        <div className={`flex flex-wrap gap-2 ${entitySlug !== "all" ? "opacity-40 pointer-events-none" : ""}`}>
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${type === t.key ? "bg-[var(--text)] text-black" : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]"}`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >{t.label}</button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search leaders or countries (e.g. Modi, Japan, Rutte)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Table */}
      {mode === "alltime" ? (
        <>
          {/* Mobile sort control: the desktop header cell (onClick={() => toggleSort(k)})
              is hidden along with the table below sm, so cards need their own way
              to drive the same sortKey/sortDir state - a Sort-by select (reuses
              toggleSort, which already sets each column's sensible default
              direction) plus a direction flip button. */}
          <div
            className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
            style={{ backgroundColor: "var(--bg)" }}
          >
            <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
              <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => {
                  const label = e.target.options[e.target.selectedIndex]?.text ?? "";
                  toggleSort(e.target.value as "score" | "power" | "name" | "since");
                  setAnnounce(`Sorted by ${label}`);
                }}
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="name">Country / Org</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                toggleSort(sortKey);
                setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
              }}
              aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
              className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {sortDir === "asc" ? "▲" : "▼"}
            </button>
            <span aria-live="polite" className="sr-only">{announce}</span>
          </div>
          {/* Mobile: stacked cards */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {allTimeRows.map((x, i) => (
              <div key={`${x.e.type}:${x.e.slug}:${i}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FlagView view={flagFor(x.e, x.en ?? null)} />
                  {x.e.href ? (
                    <Link href={x.e.href} className="font-semibold hover:text-[var(--accent)] transition-colors">{nameAt(x.e, x.en ?? "9999")}</Link>
                  ) : <span className="font-semibold">{nameAt(x.e, x.en ?? "9999")}</span>}
                  {x.e.yearRange ? <span className="text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{x.e.yearRange}</span> : null}
                  <TerritoryChips e={x.e} />
                </div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {x.n} <span className="text-xs text-[var(--text-dim)]">({x.r})</span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-dim)] tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {x.s ?? "—"} – {x.en ?? "present"}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]" style={{ backgroundColor: "var(--bg-card)" }}>
                  <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggleSort("name")}>Country / Org{arrow("name")}</th>
                  <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Leader</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Role</th>
                  <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Start</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>End</th>
                </tr>
              </thead>
              <tbody>
                {allTimeRows.map((x, i) => (
                  <tr key={`${x.e.type}:${x.e.slug}:${i}`} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="px-2 sm:px-4 py-2">
                      <FlagView view={flagFor(x.e, x.en ?? null)} />
                      {x.e.href ? (
                        <Link href={x.e.href} className="hover:text-[var(--accent)] transition-colors">{nameAt(x.e, x.en ?? "9999")}</Link>
                      ) : <span>{nameAt(x.e, x.en ?? "9999")}</span>}
                      {x.e.yearRange ? <span className="ml-1 text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{x.e.yearRange}</span> : null}
                      <TerritoryChips e={x.e} />
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-[var(--text)]">{x.n}<span className="sm:hidden text-xs text-[var(--text-dim)] ml-1">({shortRole(x.r)})</span></td>
                    <td className="hidden sm:table-cell px-4 py-2 text-[var(--text-muted)] text-xs">{x.r}</td>
                    <td className="px-2 sm:px-4 py-2 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{x.s ?? ""}</td>
                    <td className="hidden md:table-cell px-4 py-2 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{x.en ?? "present"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Mobile sort control: the desktop header cells (onClick={() => toggleSort(k)})
              are hidden along with the table below sm, so cards need their own way
              to drive the same sortKey/sortDir state - a Sort-by select (reuses
              toggleSort, which already sets each column's sensible default
              direction) plus a direction flip button. */}
          <div
            className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
            style={{ backgroundColor: "var(--bg)" }}
          >
            <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
              <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => {
                  const label = e.target.options[e.target.selectedIndex]?.text ?? "";
                  toggleSort(e.target.value as "score" | "power" | "name" | "since");
                  setAnnounce(`Sorted by ${label}`);
                }}
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="name">Country / Org</option>
                <option value="power">Power</option>
                {mode === "current" && <option value="score">Score</option>}
                <option value="since">Since</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                toggleSort(sortKey);
                setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
              }}
              aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
              className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {sortDir === "asc" ? "▲" : "▼"}
            </button>
            <span aria-live="polite" className="sr-only">{announce}</span>
          </div>
          {/* Mobile: stacked cards */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {entityRows.map(({ e, r }) => {
              const primaries = mode === "asof" ? (r?.primaries ?? []) : (e.current ? [{ name: e.current.name, role: e.current.role, start: e.current.since ?? null }] : []);
              const seconds = mode === "asof" ? (r?.seconds ?? []) : (e.current?.second ? [{ name: e.current.second.name, role: e.current.second.role }] : []);
              const sinceVal = primaries[0]?.start ?? "";
              const displayName = mode === "asof" ? nameAt(e, midMonth) : e.name;
              return (
                <div key={`${e.type}:${e.slug}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center flex-wrap gap-y-1">
                      <FlagView view={flagFor(e, mode === "asof" ? midMonth : null)} />
                      {e.href ? (
                        <Link href={e.href} className="font-semibold hover:text-[var(--accent)] transition-colors">{displayName}</Link>
                      ) : <span className="font-semibold">{displayName}</span>}
                      {e.yearRange ? <span className="ml-1 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{e.yearRange}</span> : null}
                      <TerritoryChips e={e} />
                    </div>
                    <span className="flex-shrink-0 font-semibold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{fmtPct(powerShare(e.slug))}</span>
                  </div>
                  <div className="mt-1.5">
                    {primaries.length ? (
                      <div className="text-sm text-[var(--text)]">
                        {primaries.map((p, i) => (
                          <div key={i}>
                            {e.hasHistory ? (
                              <Link href={`/leaders/${e.slug}`} className="hover:text-[var(--accent)] transition-colors">{p.name}</Link>
                            ) : p.name}
                            {(p as Line).currentOnly ? <span className="ml-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">now</span> : null}
                            <span className="text-xs text-[var(--text-dim)] ml-1">({p.role})</span>
                          </div>
                        ))}
                        {seconds.map((s, i) => (
                          <div key={`s${i}`} className="text-xs text-[var(--text-dim)]">{s.name} ({s.role})</div>
                        ))}
                        {mode === "current" && BALLOT_OF[e.slug] ? (
                          <Link href={BALLOT_OF[e.slug].href} title={BALLOT_OF[e.slug].title} className="inline-block mt-0.5 text-[10px] text-[var(--accent)] hover:underline">
                            elected · {BALLOT_OF[e.slug].year} →
                          </Link>
                        ) : null}
                      </div>
                    ) : <span className="text-sm text-[var(--text-dim)]">—</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    {regionLabel(e) && <span>{regionLabel(e)}</span>}
                    {mode === "current" && e.scoreTotal != null && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>Score {fmtScore(e.scoreTotal)}</span>
                    )}
                    {sinceVal && <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Since {sinceVal}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]" style={{ backgroundColor: "var(--bg-card)" }}>
                  <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggleSort("name")}>Country / Org{arrow("name")}</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Region</th>
                  <th className="px-2 sm:px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("power")} title={relYear ? `Share of world power, ${relYear}` : "Power ranking available 1500 onward"}>Power{arrow("power")}</th>
                  {mode === "current" && (
                    <th className="hidden sm:table-cell px-2 sm:px-4 py-3 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("score")} title="Metro-based country score">Score{arrow("score")}</th>
                  )}
                  <th className="px-2 sm:px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Leader</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)]">Role</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }} onClick={() => toggleSort("since")}>Since{arrow("since")}</th>
                </tr>
              </thead>
              <tbody>
                {entityRows.map(({ e, r }) => {
                  const primaries = mode === "asof" ? (r?.primaries ?? []) : (e.current ? [{ name: e.current.name, role: e.current.role, start: e.current.since ?? null }] : []);
                  const seconds = mode === "asof" ? (r?.seconds ?? []) : (e.current?.second ? [{ name: e.current.second.name, role: e.current.second.role }] : []);
                  const sinceVal = primaries[0]?.start ?? "";
                  const displayName = mode === "asof" ? nameAt(e, midMonth) : e.name;
                  return (
                    <tr key={`${e.type}:${e.slug}`} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="px-2 sm:px-4 py-3">
                        <FlagView view={flagFor(e, mode === "asof" ? midMonth : null)} />
                        {e.href ? (
                          <Link href={e.href} className="font-semibold hover:text-[var(--accent)] transition-colors">{displayName}</Link>
                        ) : <span className="font-semibold">{displayName}</span>}
                        {e.yearRange ? <span className="ml-1 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{e.yearRange}</span> : null}
                      <TerritoryChips e={e} />
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-[var(--text-muted)] text-xs">{regionLabel(e)}</td>
                      <td className="px-2 sm:px-4 py-3 text-right font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{fmtPct(powerShare(e.slug))}</td>
                      {mode === "current" && (
                        <td className="hidden sm:table-cell px-2 sm:px-4 py-3 text-right font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>{fmtScore(e.scoreTotal)}</td>
                      )}
                      <td className="px-2 sm:px-4 py-3">
                        {primaries.length ? (
                          <span className="text-[var(--text)]">
                            {primaries.map((p, i) => (
                              <span key={i} className="block">
                                {e.hasHistory ? (
                                  <Link href={`/leaders/${e.slug}`} className="hover:text-[var(--accent)] transition-colors">{p.name}</Link>
                                ) : p.name}
                                {(p as Line).currentOnly ? <span className="ml-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">now</span> : null}
                                <span className="sm:hidden text-xs text-[var(--text-dim)] ml-1">({p.role})</span>
                              </span>
                            ))}
                            {seconds.map((s, i) => (
                              <span key={`s${i}`} className="block text-xs text-[var(--text-dim)]">{s.name} ({s.role})</span>
                            ))}
                            {mode === "current" && BALLOT_OF[e.slug] ? (
                              <Link href={BALLOT_OF[e.slug].href} title={BALLOT_OF[e.slug].title} className="block w-fit mt-0.5 text-[10px] text-[var(--accent)] hover:underline">
                                elected · {BALLOT_OF[e.slug].year} →
                              </Link>
                            ) : null}
                          </span>
                        ) : <span className="text-[var(--text-dim)]">—</span>}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-[var(--text-muted)] text-xs">{primaries.map((p) => p.role).join(", ")}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sinceVal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(mode === "alltime" ? allTimeRows.length : entityRows.length) === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {mode === "alltime" && entitySlug === "all"
            ? "Select a country or organisation above, or search by name, to view its full leader history."
            : "No leaders match your filters."}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-dim)] mt-2">
          {mode === "alltime"
            ? `${allTimeRows.length} terms shown.`
            : `${entityRows.length} ${entityRows.length === 1 ? "office" : "offices"} shown${mode === "asof" ? ` as of ${MONTHS[month - 1]} ${yearNum}${era === "BC" ? " BC" : ""}` : " (current)"}.`}
        </p>
      )}
    </div>
  );
}
