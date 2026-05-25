"use client";

// Client wrapper for the Big 5 league hub map. Single-country (no country
// chips), with year input + slider + step buttons and a level filter row
// (only relevant when England, since the other four are L1 only in v0).
// Reuses FootballMapInner so the visual matches the /teams/football index.

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { FootballMapPoint } from "../../FootballMapInner";

const FootballMap = dynamic(() => import("../../FootballMapInner"), {
  ssr: false,
  loading: () => null,
});

// Per-country color ramp by tier. England gets the red shading; the
// other four countries are L1-only in v0.
const COUNTRY_TIER_COLORS: Record<string, Record<number, string>> = {
  England: { 1: "#dc2626", 2: "#ef4444", 3: "#f87171", 4: "#fca5a5", 5: "#fecaca" },
  Spain:   { 1: "#f97316" },
  Italy:   { 1: "#15803d" },
  Germany: { 1: "#eab308" },
  France:  { 1: "#1d4ed8" },
};

function colorForTier(country: string, level: number | undefined): string {
  const ramp = COUNTRY_TIER_COLORS[country];
  if (ramp && level !== undefined && ramp[level]) return ramp[level];
  return ramp?.[1] ?? "#525252";
}

const COUNTRY_LEVELS_IN_SCOPE: Record<string, number[]> = {
  England: [1, 2, 3, 4, 5],
  Spain:   [1],
  Italy:   [1],
  Germany: [1],
  France:  [1],
};

export type HubClub = {
  slug: string;
  cur_name: string;
  metro: string | null;
  lat: number | null;
  lng: number | null;
  first_year: number | null;
  last_year: number | null;
  tier_by_year: Record<string, number>;
};

type Props = {
  country: string;
  clubs: HubClub[];
};

export default function LeagueHubMap({ country, clubs }: Props) {
  const [levels, setLevels] = useState<Set<number>>(new Set());
  const [seasonYear, setSeasonYear] = useState<string>("");

  const visibleLevels = COUNTRY_LEVELS_IN_SCOPE[country] ?? [1];
  const showLevelRow = visibleLevels.length > 1;

  const { minYear, maxYear } = useMemo(() => {
    let lo = 9999, hi = 0;
    for (const c of clubs) {
      if (c.first_year && c.first_year < lo) lo = c.first_year;
      if (c.last_year && c.last_year > hi) hi = c.last_year;
    }
    return { minYear: lo === 9999 ? 1870 : lo, maxYear: hi === 0 ? 2026 : hi };
  }, [clubs]);

  // Prune invalid level selections when the country scope shrinks.
  useEffect(() => {
    if (levels.size === 0) return;
    const visibleSet = new Set(visibleLevels);
    let changed = false;
    const next = new Set<number>();
    for (const lv of levels) {
      if (visibleSet.has(lv)) next.add(lv); else changed = true;
    }
    if (changed) setLevels(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const toggleLevel = (n: number) => {
    const next = new Set(levels);
    if (next.has(n)) next.delete(n); else next.add(n);
    setLevels(next);
  };

  const points: FootballMapPoint[] = useMemo(() => {
    const sy = seasonYear ? parseInt(seasonYear, 10) : null;
    const out: FootballMapPoint[] = [];
    for (const c of clubs) {
      if (c.lat === null || c.lng === null) continue;
      const lvl = sy !== null
        ? c.tier_by_year[String(sy)]
        : (Object.values(c.tier_by_year).length
            ? Math.min(...Object.values(c.tier_by_year))
            : undefined);
      // Year filter: only show clubs with a recorded level for that year.
      if (sy !== null && lvl === undefined) continue;
      // Level filter (multi-select). Empty set = all in-scope levels.
      if (levels.size > 0 && (lvl === undefined || !levels.has(lvl))) continue;
      out.push({
        slug: c.slug,
        cur_name: c.cur_name,
        country,
        metro: c.metro,
        lat: c.lat,
        lng: c.lng,
        color: colorForTier(country, lvl),
      });
    }
    return out;
  }, [clubs, country, levels, seasonYear]);

  // Refit only on first mount; year / level changes shouldn't reset zoom.
  const refitKey = "country-fixed";

  const totalCount = points.length;
  const anyActive = levels.size > 0 || seasonYear !== "";
  const clearAll = () => { setLevels(new Set()); setSeasonYear(""); };

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Map</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every club in scope for {country}, color-coded by tier. Filter by season year and (England only) by level.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {showLevelRow && (
          <>
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] mr-1">Level</span>
            {visibleLevels.map((n) => {
              const active = levels.has(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleLevel(n)}
                  className="text-xs px-2.5 py-1 rounded-md border transition tabular-nums"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </>
        )}
        <label className="text-xs uppercase tracking-wide text-[var(--text-muted)] ml-auto">
          Active in season ending
        </label>
        <input
          type="number"
          min={minYear}
          max={maxYear}
          step={1}
          value={seasonYear}
          onChange={(e) => setSeasonYear(e.target.value)}
          placeholder="ALL"
          className="text-sm px-2 py-1 rounded-md border w-24 tabular-nums"
          style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <button
          type="button"
          onClick={() => {
            const cur = seasonYear ? parseInt(seasonYear, 10) : maxYear + 1;
            const next = cur - 1;
            if (next < minYear) setSeasonYear(String(minYear));
            else if (next >= maxYear + 1) setSeasonYear("");
            else setSeasonYear(String(next));
          }}
          disabled={seasonYear !== "" && parseInt(seasonYear, 10) <= minYear}
          aria-label="Previous year"
          className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
        >◀</button>
        <input
          type="range"
          min={minYear}
          max={maxYear + 1}
          step={1}
          value={seasonYear ? parseInt(seasonYear, 10) : maxYear + 1}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (v >= maxYear + 1) setSeasonYear("");
            else setSeasonYear(String(v));
          }}
          className="flex-1 min-w-[180px] max-w-md accent-[var(--accent)]"
          aria-label="Season year slider"
        />
        <button
          type="button"
          onClick={() => {
            const cur = seasonYear ? parseInt(seasonYear, 10) : maxYear + 1;
            const next = cur + 1;
            if (next >= maxYear + 1) setSeasonYear("");
            else setSeasonYear(String(next));
          }}
          disabled={seasonYear === ""}
          aria-label="Next year"
          className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
        >▶</button>
        {anyActive && (
          <button
            onClick={clearAll}
            className="text-xs px-2.5 py-1 rounded-md border hover:bg-[var(--bg-card-hover)] transition"
            style={{ borderColor: "var(--border)" }}
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-3 tabular-nums">
        {totalCount} club{totalCount === 1 ? "" : "s"}
        {seasonYear ? <> in the {parseInt(seasonYear, 10) - 1}-{String(parseInt(seasonYear, 10)).slice(-2)} season</> : <> across all eras</>}
      </p>

      <div
        className="rounded-lg border overflow-hidden mt-4"
        style={{ borderColor: "var(--border)", height: 360 }}
      >
        <FootballMap points={points} refitKey={refitKey} />
      </div>
    </section>
  );
}
