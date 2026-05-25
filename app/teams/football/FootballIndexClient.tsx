"use client";

// Client-side filter shell for /teams/football. Country chips (multi-select)
// and season-year filter that limits to clubs active in the selected year.
//
// Active = first_year <= year <= last_year. England clubs additionally show
// their highest tier reached as a label.

import { useMemo, useState } from "react";
import Link from "next/link";

export type IndexClub = {
  slug: string;
  cur_name: string;
  country: string;
  metro: string | null;
  tiers: number[];
  first_year: number | null;
  last_year: number | null;
  league_seasons: number;
};

type Props = {
  clubs: IndexClub[];
};

const COUNTRY_ORDER = ["England", "Spain", "Italy", "Germany", "France"];

const TIER_LABEL_BY_COUNTRY: Record<string, Record<number, string>> = {
  England: {
    1: "Premier League / First Division",
    2: "Championship",
    3: "League One",
    4: "League Two",
    5: "National League",
  },
};

export default function FootballIndexClient({ clubs }: Props) {
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [seasonYear, setSeasonYear] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Year bounds across the whole dataset, used for the season slider/select.
  const { minYear, maxYear } = useMemo(() => {
    let lo = 9999, hi = 0;
    for (const c of clubs) {
      if (c.first_year && c.first_year < lo) lo = c.first_year;
      if (c.last_year && c.last_year > hi) hi = c.last_year;
    }
    return { minYear: lo === 9999 ? 1870 : lo, maxYear: hi === 0 ? 2027 : hi };
  }, [clubs]);

  const toggleCountry = (c: string) => {
    const next = new Set(countries);
    if (next.has(c)) next.delete(c); else next.add(c);
    setCountries(next);
  };

  const filtered = useMemo(() => {
    const sy = seasonYear ? parseInt(seasonYear, 10) : null;
    const q = search.trim().toLowerCase();
    return clubs.filter((c) => {
      if (countries.size > 0 && !countries.has(c.country)) return false;
      if (sy !== null && !Number.isNaN(sy)) {
        const fy = c.first_year ?? 9999;
        const ly = c.last_year ?? 0;
        if (sy < fy || sy > ly) return false;
      }
      if (q && !c.cur_name.toLowerCase().includes(q) && !(c.metro ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clubs, countries, seasonYear, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, IndexClub[]>();
    for (const c of filtered) {
      if (!map.has(c.country)) map.set(c.country, []);
      map.get(c.country)!.push(c);
    }
    return COUNTRY_ORDER.filter((c) => map.has(c)).map((country) => ({
      country,
      clubs: map.get(country)!.slice().sort((a, b) => {
        const ta = Math.min(...(a.tiers.length ? a.tiers : [99]));
        const tb = Math.min(...(b.tiers.length ? b.tiers : [99]));
        if (ta !== tb) return ta - tb;
        return a.cur_name.localeCompare(b.cur_name);
      }),
    }));
  }, [filtered]);

  const totalCount = filtered.length;
  const clearAll = () => { setCountries(new Set()); setSeasonYear(""); setSearch(""); };
  const anyActive = countries.size > 0 || seasonYear !== "" || search !== "";

  return (
    <div>
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] mr-1">Country</span>
          {COUNTRY_ORDER.map((c) => {
            const active = countries.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCountry(c)}
                className="text-xs px-2.5 py-1 rounded-md border transition"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text)",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Active in season ending
          </label>
          <input
            type="number"
            min={minYear}
            max={maxYear}
            step={1}
            value={seasonYear}
            onChange={(e) => setSeasonYear(e.target.value)}
            placeholder={`${minYear} - ${maxYear}`}
            className="text-sm px-2 py-1 rounded-md border w-24 tabular-nums"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={seasonYear || maxYear}
            onChange={(e) => setSeasonYear(e.target.value)}
            className="flex-1 min-w-[180px] max-w-md accent-[var(--accent)]"
            aria-label="Season year slider"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search club or metro"
            className="text-sm px-2 py-1 rounded-md border w-48"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          />
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
          Showing {totalCount} of {clubs.length} clubs
          {seasonYear && <> active in the {parseInt(seasonYear, 10) - 1}-{String(parseInt(seasonYear, 10)).slice(-2)} season</>}
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">No clubs match the current filters.</p>
      ) : (
        grouped.map((g) => (
          <section key={g.country} className="mb-10">
            <h2 className="text-xl font-semibold mb-3">
              {g.country}{" "}
              <span className="text-sm text-[var(--text-muted)] font-normal tabular-nums">
                ({g.clubs.length})
              </span>
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
              {g.clubs.map((c) => {
                const highest = Math.min(...(c.tiers.length ? c.tiers : [99]));
                const tierLabel = TIER_LABEL_BY_COUNTRY[g.country]?.[highest];
                return (
                  <li key={c.slug}>
                    <Link href={`/teams/football/${c.slug}`} className="hover:underline">
                      {c.cur_name}
                    </Link>
                    <span className="text-[var(--text-muted)] text-xs ml-2">
                      {c.metro}
                      {g.country === "England" && tierLabel && highest > 1 && (
                        <span className="ml-1.5">· {tierLabel}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
