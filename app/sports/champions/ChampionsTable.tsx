"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Single merged, filterable champions board for /sports/champions. Plain
// serializable rows come from the server page (no server-only imports here).
// Filter by scope, sport and region; click a column header to sort, click
// again to flip direction.

export type ChampRow = {
  team: string;
  teamHref: string | null;
  sport: string;
  competition: string;
  leagueHref: string | null;
  scopeType: "International" | "Continental" | "Domestic" | null;
  geo: string;
  region: string;
  year: number | null;
  gold: boolean;
};

type SortKey = "team" | "competition" | "scope" | "geo" | "year";

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ALL = "All";

const SCOPE_OPTS = ["International", "Continental", "Domestic"];
const REGION_ORDER = [
  "World",
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
  "Other",
];

const CONTINENTS = new Set([
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
]);

// World first, then continents, then countries; alpha within each tier.
function geoRank(g: string): number {
  if (g === "World") return 0;
  if (CONTINENTS.has(g)) return 1;
  if (g === "—") return 3;
  return 2;
}

const SCOPE_RANK: Record<string, number> = {
  International: 0,
  Continental: 1,
  Domestic: 2,
};

function sportDisplay(s: string): string {
  return s.replace(/^W /, "Women's ");
}

export default function ChampionsTable({ rows }: { rows: ChampRow[] }) {
  const [scope, setScope] = useState<string>(ALL);
  const [sport, setSport] = useState<string>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const sportOpts = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.sport))).sort((a, b) =>
        sportDisplay(a).localeCompare(sportDisplay(b)),
      ),
    [rows],
  );
  const regionOpts = useMemo(() => {
    const present = new Set(rows.map((r) => r.region));
    return REGION_ORDER.filter((r) => present.has(r));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (scope === ALL || r.scopeType === scope) &&
          (sport === ALL || r.sport === sport) &&
          (region === ALL || r.region === region),
      ),
    [rows, scope, sport, region],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "year") {
        cmp = (a.year ?? 0) - (b.year ?? 0);
      } else if (sortKey === "geo") {
        cmp = geoRank(a.geo) - geoRank(b.geo) || a.geo.localeCompare(b.geo);
      } else if (sortKey === "scope") {
        cmp =
          (SCOPE_RANK[a.scopeType ?? ""] ?? 9) -
          (SCOPE_RANK[b.scopeType ?? ""] ?? 9);
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, dir]);

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(1);
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (dir === 1 ? " ▲" : " ▼") : "";

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

  function Select({
    label,
    value,
    onChange,
    opts,
    fmt,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    opts: string[];
    fmt?: (v: string) => string;
  }) {
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
            <option key={o} value={o}>
              {fmt ? fmt(o) : o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const hasFilter = scope !== ALL || sport !== ALL || region !== ALL;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Select label="Scope" value={scope} onChange={setScope} opts={SCOPE_OPTS} />
        <Select label="Sport" value={sport} onChange={setSport} opts={sportOpts} fmt={sportDisplay} />
        <Select label="Region" value={region} onChange={setRegion} opts={regionOpts} />
        <div className="flex items-center gap-3 ml-auto text-xs text-[var(--text-muted)]">
          <span>
            <strong className="text-[var(--text)] tabular-nums" style={mono}>{sorted.length}</strong>
            {sorted.length === 1 ? " champion" : " champions"}
          </span>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setScope(ALL);
                setSport(ALL);
                setRegion(ALL);
              }}
              className="underline hover:text-[var(--accent)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs">
              <Th label="Champion" k="team" />
              <Th label="Competition" k="competition" />
              <Th label="Scope" k="scope" />
              <Th label="Region" k="geo" />
              <Th label="Since" k="year" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={`${c.team}-${c.competition}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-3 align-top">
                  <div className="font-medium text-sm leading-tight">
                    {c.teamHref ? (
                      <Link href={c.teamHref} className="hover:text-[var(--accent)] hover:underline">
                        {c.team}
                      </Link>
                    ) : (
                      <span>{c.team}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-dim)]">{sportDisplay(c.sport)}</div>
                </td>
                <td className="py-2 px-3 align-top">
                  {c.leagueHref ? (
                    <Link href={c.leagueHref} className="hover:text-[var(--accent)] hover:underline">
                      {c.competition}
                    </Link>
                  ) : (
                    <span>{c.competition}</span>
                  )}
                  {c.gold && (
                    <span
                      aria-label="Gold Standard competition"
                      title="Gold Standard — the apex trophy in its sport"
                      className="ml-1 cursor-default"
                    >
                      🥇
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 align-top text-[var(--text-muted)]">{c.scopeType ?? "—"}</td>
                <td className="py-2 px-3 align-top text-[var(--text-muted)]">{c.geo}</td>
                <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: GOLD }}>
                  {c.year ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
