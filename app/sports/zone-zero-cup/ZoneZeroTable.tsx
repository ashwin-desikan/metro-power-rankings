"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Interactive Zone Zero Cup table. Plain serializable rows come from the server
// page. A view toggle switches the ranking basis (overall merit / per capita /
// per GDP); a region filter narrows by continent; a sport filter switches to a
// per-sport view showing that sport's merit contribution and the nation's world
// ranking in it; any column header sorts.

export type ZzcRow = {
  slug: string;
  countrySlug: string | null;
  name: string;
  continent: string | null;
  merit: number;
  rank: number;
  meritPerCapita: number | null;
  rankPerCapita: number | null;
  meritPerGdp: number | null;
  rankPerGdp: number | null;
  majorTitles: number;
  bestRank: number | null;
  bestRankSport: string | null;
  topSports: { sport: string; pts: number }[];
  sportMerit: Record<string, number>;
  sportRank: Record<string, number>;
  suspended: boolean;
  defunct: boolean;
};

type View = "overall" | "percapita" | "pergdp";
type SortKey = "rank" | "name" | "merit" | "titles" | "best";

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ALL = "All";

const VIEWS: { key: View; label: string; blurb: string }[] = [
  { key: "overall", label: "Overall", blurb: "Total sporting merit." },
  { key: "percapita", label: "Per capita", blurb: "Merit per million people." },
  { key: "pergdp", label: "Per GDP", blurb: "Merit per trillion dollars of GDP." },
];

function rowRank(r: ZzcRow, v: View): number | null {
  return v === "percapita" ? r.rankPerCapita : v === "pergdp" ? r.rankPerGdp : r.rank;
}
function rowMerit(r: ZzcRow, v: View): number | null {
  return v === "percapita" ? r.meritPerCapita : v === "pergdp" ? r.meritPerGdp : r.merit;
}

export default function ZoneZeroTable({
  rows,
  regions,
  sports,
}: {
  rows: ZzcRow[];
  regions: string[];
  sports: string[];
}) {
  const [view, setView] = useState<View>("overall");
  const [region, setRegion] = useState<string>(ALL);
  const [sport, setSport] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);

  const sportMode = sport !== ALL;

  // global standing within the selected sport (by that sport's merit), so the
  // # column is a true world position regardless of the region filter or sort
  const sportPos = useMemo(() => {
    const m = new Map<string, number>();
    if (!sportMode) return m;
    rows
      .filter((r) => r.sportMerit[sport] != null)
      .sort((a, b) => (b.sportMerit[sport] ?? 0) - (a.sportMerit[sport] ?? 0))
      .forEach((r, i) => m.set(r.slug, i + 1));
    return m;
  }, [rows, sport, sportMode]);

  const filtered = useMemo(() => {
    let out = rows;
    if (sportMode) out = out.filter((r) => r.sportMerit[sport] != null);
    else if (view !== "overall") out = out.filter((r) => rowMerit(r, view) != null);
    if (region !== ALL) out = out.filter((r) => r.continent === region);
    return out;
  }, [rows, sportMode, sport, view, region]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "titles") {
        cmp = a.majorTitles - b.majorTitles;
      } else if (sortKey === "best") {
        const ar = sportMode ? a.sportRank[sport] : a.bestRank;
        const br = sportMode ? b.sportRank[sport] : b.bestRank;
        cmp = (ar ?? 9999) - (br ?? 9999);
      } else if (sortKey === "merit") {
        const av = sportMode ? a.sportMerit[sport] : rowMerit(a, view);
        const bv = sportMode ? b.sportMerit[sport] : rowMerit(b, view);
        cmp = (av ?? -1) - (bv ?? -1);
      } else {
        const ar = sportMode ? sportPos.get(a.slug) : rowRank(a, view);
        const br = sportMode ? sportPos.get(b.slug) : rowRank(b, view);
        cmp = (ar ?? 99999) - (br ?? 99999);
      }
      return cmp * dir;
    });
    return out;
  }, [filtered, sortKey, dir, view, sportMode, sport, sportPos]);

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(key === "merit" || key === "titles" ? -1 : 1);
    }
  }

  function reset() {
    setRegion(ALL);
    setSport(ALL);
    setSortKey("rank");
    setDir(1);
  }

  const arrow = (key: SortKey) => (sortKey === key ? (dir === 1 ? " ▲" : " ▼") : "");
  const hasState = region !== ALL || sport !== ALL || sortKey !== "rank" || dir !== 1;
  const meritLabel = sportMode
    ? `${sport} merit`
    : view === "overall"
      ? "Merit"
      : view === "percapita"
        ? "Per M"
        : "Per $T";

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

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* view toggle — only meaningful for the overall table */}
        {!sportMode && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="uppercase tracking-wide text-[var(--text-dim)]">Ranking</span>
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {VIEWS.map((v) => {
                const active = view === v.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setView(v.key)}
                    className="px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: active ? "var(--accent)" : "var(--bg-card)",
                      color: active ? "var(--bg)" : "var(--text-muted)",
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* sport filter */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Sport</span>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value={ALL}>All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {/* region filter */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-[var(--text-dim)]">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value={ALL}>All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={reset}
          disabled={!hasState}
          className="rounded-lg border px-3 py-2 text-sm font-medium enabled:hover:text-[var(--accent)] enabled:hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-default"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          Reset
        </button>

        <div className="ml-auto self-center text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text)] tabular-nums" style={mono}>{sorted.length}</strong>
          {sorted.length === 1 ? " nation" : " nations"}
        </div>
      </div>

      <p className="text-xs text-[var(--text-dim)] mb-3">
        {sportMode
          ? `Each nation's merit contribution in ${sport} and its current world ranking in that sport, where one exists.`
          : VIEWS.find((v) => v.key === view)?.blurb}{" "}
        Click any column to sort. § currently suspended from international competition; ‡ defunct or composite state.
      </p>

      <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs">
              <Th label="#" k="rank" right />
              <Th label="Nation" k="name" />
              <Th label={meritLabel} k="merit" right />
              {!sportMode && <Th label="Major titles" k="titles" right />}
              <Th label="World rank" k="best" />
              {!sportMode && (
                <th className="py-2 px-3 font-medium text-left" style={{ color: "var(--text-muted)" }} scope="col">
                  Strongest sports
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rk = sportMode ? sportPos.get(r.slug) : rowRank(r, view);
              const mt = sportMode ? r.sportMerit[sport] : rowMerit(r, view);
              const wr = sportMode ? r.sportRank[sport] : r.bestRank;
              const wrSport = sportMode ? sport : r.bestRankSport;
              return (
                <tr key={r.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: "var(--text-dim)" }}>
                    {rk ?? i + 1}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="font-medium text-sm leading-tight">
                      {r.countrySlug ? (
                        <Link href={`/countries/${r.countrySlug}`} className="hover:text-[var(--accent)] hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span>{r.name}</span>
                      )}
                      {r.suspended && (
                        <span title="Currently suspended from international competition" className="ml-1 cursor-default text-[var(--text-dim)]">§</span>
                      )}
                      {r.defunct && (
                        <span title="Defunct or composite state" className="ml-1 cursor-default text-[var(--text-dim)]">‡</span>
                      )}
                    </div>
                    {r.continent && <div className="text-[11px] text-[var(--text-dim)]">{r.continent}</div>}
                  </td>
                  <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: GOLD }}>
                    {mt == null ? "" : view === "percapita" && !sportMode ? mt.toFixed(2) : view === "pergdp" && !sportMode ? mt.toFixed(1) : mt.toFixed(sportMode ? 1 : 0)}
                  </td>
                  {!sportMode && (
                    <td className="py-2 px-3 align-top text-right tabular-nums text-[var(--text-muted)]" style={mono}>
                      {r.majorTitles || ""}
                    </td>
                  )}
                  <td className="py-2 px-3 align-top text-[var(--text-muted)] whitespace-nowrap">
                    {wr ? (
                      <span>
                        <span className="tabular-nums" style={mono}>#{wr}</span>
                        {!sportMode && wrSport ? <span className="text-[11px] text-[var(--text-dim)]"> {wrSport}</span> : null}
                      </span>
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                  {!sportMode && (
                    <td className="py-2 px-3 align-top text-[var(--text-muted)] text-[13px]">
                      {r.topSports.slice(0, 3).map((s) => s.sport).join(", ")}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
