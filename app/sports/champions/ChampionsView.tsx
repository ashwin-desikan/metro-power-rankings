"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSessionState } from "@/lib/useSessionState";
import ChampionsTable, { type ChampRow } from "./ChampionsTable";
import { sportIcon } from "@/lib/sportLabels";
import ChampionLogo from "@/app/teams/_shared/ChampionLogo";

// Client wrapper for /sports/champions: a Current | All-Time toggle. Current is
// the existing reigning-holders board; All-Time is a competition index ordered
// by tier (apex first; tier itself hidden), with the same Scope / Sport /
// Region filters as the Current board. Each row links to its honour roll.
// Toggle + filters persist for the browser session.

export type CompIndexEntry = {
  competition: string;
  compSlug: string;
  sport: string;
  scopeType: string;
  geo: string;
  region: string;
  tier: number | null;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  current: { champion: string; canonical: string; teamHref: string | null; year: number | null } | null;
};

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ALL = "All";
const SCOPE_OPTS = ["International", "Continental", "Domestic"];
const REGION_ORDER = ["World", "Africa", "Asia", "Europe", "North America", "Oceania", "South America", "Other"];

function sportDisplay(s: string): string {
  return s.replace(/^W /, "Women's ");
}
function span(e: CompIndexEntry): string {
  if (e.firstYear == null || e.lastYear == null) return "";
  return e.firstYear === e.lastYear ? `${e.firstYear}` : `${e.firstYear}–${e.lastYear}`;
}

function Select({
  label, value, onChange, opts, fmt,
}: { label: string; value: string; onChange: (v: string) => void; opts: string[]; fmt?: (v: string) => string }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="uppercase tracking-wide text-[var(--text-dim)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <option value={ALL}>All</option>
        {opts.map((o) => (
          <option key={o} value={o}>{fmt ? fmt(o) : o}</option>
        ))}
      </select>
    </label>
  );
}

function AllTimeIndex({ index }: { index: CompIndexEntry[] }) {
  const [scope, setScope] = useSessionState<string>("champions-all-scope", ALL);
  const [sport, setSport] = useSessionState<string>("champions-all-sport", ALL);
  const [region, setRegion] = useSessionState<string>("champions-all-region", ALL);

  // Interdependent options: each filter's choices come from rows passing the
  // other two, so a combination is never empty; the current pick is always kept.
  const scopeOpts = useMemo(() => {
    const present = new Set(
      index.filter((e) => (sport === ALL || e.sport === sport) && (region === ALL || e.region === region)).map((e) => e.scopeType),
    );
    const list = SCOPE_OPTS.filter((s) => present.has(s));
    if (scope !== ALL && !list.includes(scope)) list.unshift(scope);
    return list;
  }, [index, sport, region, scope]);

  const sportOpts = useMemo(() => {
    const present = new Set(
      index.filter((e) => (scope === ALL || e.scopeType === scope) && (region === ALL || e.region === region)).map((e) => e.sport),
    );
    const list = Array.from(present).sort((a, b) => sportDisplay(a).localeCompare(sportDisplay(b)));
    if (sport !== ALL && !list.includes(sport)) list.unshift(sport);
    return list;
  }, [index, scope, region, sport]);

  const regionOpts = useMemo(() => {
    const present = new Set(
      index.filter((e) => (scope === ALL || e.scopeType === scope) && (sport === ALL || e.sport === sport)).map((e) => e.region),
    );
    const list = REGION_ORDER.filter((x) => present.has(x));
    if (region !== ALL && !list.includes(region)) list.push(region);
    return list;
  }, [index, scope, sport, region]);

  // index arrives already ordered by tier (apex first); filtering preserves it.
  const rows = useMemo(
    () =>
      index.filter(
        (e) =>
          (scope === ALL || e.scopeType === scope) &&
          (sport === ALL || e.sport === sport) &&
          (region === ALL || e.region === region),
      ),
    [index, scope, sport, region],
  );

  const hasFilter = scope !== ALL || sport !== ALL || region !== ALL;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <Select label="Scope" value={scope} onChange={setScope} opts={scopeOpts} />
        <Select label="Sport" value={sport} onChange={setSport} opts={sportOpts} fmt={sportDisplay} />
        <Select label="Region" value={region} onChange={setRegion} opts={regionOpts} />
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setScope(ALL); setSport(ALL); setRegion(ALL); }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline pb-2"
          >
            Reset
          </button>
        )}
        <span className="text-xs text-[var(--text-dim)] ml-auto pb-2 tabular-nums" style={mono}>
          {rows.length} competition{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
        {rows.map((e) => (
          <div key={e.compSlug} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--bg-card)] transition">
            <Link href={`/sports/champions/${e.compSlug}`} className={`text-[var(--text)] hover:text-[var(--accent)] hover:underline ${e.tier != null && e.tier <= 2 ? "font-bold text-lg" : "font-semibold"}`}>
              {sportIcon(e.sport) && <span aria-hidden className="mr-1">{sportIcon(e.sport)}</span>}
              {e.competition}
            </Link>
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
              {sportDisplay(e.sport)}{e.region && e.region !== "Other" ? ` · ${e.region}` : ""}
            </span>
            <span className="text-xs tabular-nums text-[var(--text-muted)]" style={mono}>{span(e)}</span>
            <span className="text-xs tabular-nums text-[var(--text-dim)]" style={mono}>
              {e.count} {e.count === 1 ? "champion" : "champions"}
            </span>
            {e.current && (
              <span className="text-xs text-[var(--text-muted)] ml-auto">
                Current:{" "}
                <ChampionLogo name={e.current.champion} canonical={e.current.canonical} size={e.tier != null && e.tier <= 2 ? 20 : 16} />
                {e.current.teamHref ? (
                  <Link href={e.current.teamHref} className={`hover:text-[var(--accent)] hover:underline text-[var(--text)] ${e.tier != null && e.tier <= 2 ? "font-bold text-sm" : ""}`}>
                    {e.current.canonical || e.current.champion}
                  </Link>
                ) : (
                  <span className={`text-[var(--text)] ${e.tier != null && e.tier <= 2 ? "font-bold text-sm" : ""}`}>{e.current.canonical || e.current.champion}</span>
                )}
                {e.current.year != null && <span className="text-[var(--text-dim)]"> ({e.current.year})</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChampionsView({ current, index }: { current: ChampRow[]; index: CompIndexEntry[] }) {
  const [view, setView] = useSessionState<"current" | "all">("champions-view", "current");
  const btn = (v: "current" | "all", label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
        view === v
          ? "bg-[var(--accent)] text-white"
          : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex gap-2 mb-5" role="group" aria-label="Champions view">
        {btn("current", "Current")}
        {btn("all", "All-Time")}
      </div>
      {view === "current" ? <ChampionsTable rows={current} /> : <AllTimeIndex index={index} />}
    </div>
  );
}
