"use client";

// Client-side filter shell for /teams/football. Country chips (multi-select)
// and season-year filter that limits to clubs active in the selected year.
//
// Active = first_year <= year <= last_year. England clubs additionally show
// their highest tier reached as a label.

import { useMemo, useState } from "react";
import Link from "next/link";

// Tiny color dot keyed by slug. Mirrors the curated colors + slug-hash
// fallback from lib/football.ts. Re-implemented client-side because the
// 60-entry CURATED map + 12-entry palette is small enough to ship inline
// and avoids forcing the entire server-only lib/football module into the
// client bundle.
const CURATED: Record<string, { bg: string; fg: string }> = {
  arsenal: { bg: "#EF0107", fg: "#FFF" },
  "manchester-united": { bg: "#DA291C", fg: "#FFE500" },
  "manchester-city": { bg: "#6CABDD", fg: "#1C2C5B" },
  liverpool: { bg: "#C8102E", fg: "#FFF" },
  chelsea: { bg: "#034694", fg: "#FFF" },
  "tottenham-hotspur": { bg: "#132257", fg: "#FFF" },
  "newcastle-united": { bg: "#241F20", fg: "#FFF" },
  "aston-villa": { bg: "#670E36", fg: "#94BEE5" },
  everton: { bg: "#003399", fg: "#FFF" },
  "leeds-united": { bg: "#FFCD00", fg: "#1D428A" },
  "west-ham-united": { bg: "#7A263A", fg: "#1BB1E7" },
  "nottingham-forest": { bg: "#DD0000", fg: "#FFF" },
  "brighton-hove-albion": { bg: "#0057B8", fg: "#FFF" },
  "crystal-palace": { bg: "#1B458F", fg: "#C4122E" },
  "wolverhampton-wanderers": { bg: "#FDB913", fg: "#231F20" },
  southampton: { bg: "#D71920", fg: "#FFF" },
  "leicester-city": { bg: "#003090", fg: "#FDBE11" },
  sunderland: { bg: "#EB172B", fg: "#FFF" },
  "sheffield-united": { bg: "#EE2737", fg: "#FFF" },
  "sheffield-wednesday": { bg: "#0E4C92", fg: "#FFF" },
  "derby-county": { bg: "#000", fg: "#FFF" },
  middlesbrough: { bg: "#E2231A", fg: "#FFF" },
  "preston-north-end": { bg: "#FFF", fg: "#1F4193" },
  "afc-bournemouth": { bg: "#DA291C", fg: "#000" },
  fulham: { bg: "#000", fg: "#FFF" },
  brentford: { bg: "#E30613", fg: "#FFF" },
  "real-madrid": { bg: "#FEBE10", fg: "#00529F" },
  "fc-barcelona": { bg: "#A50044", fg: "#004D98" },
  "atletico-de-madrid": { bg: "#CB3524", fg: "#FFF" },
  sevilla: { bg: "#D71920", fg: "#FFF" },
  valencia: { bg: "#FF7F00", fg: "#000" },
  "real-sociedad": { bg: "#003F87", fg: "#FFF" },
  "athletic-bilbao": { bg: "#EE2523", fg: "#FFF" },
  villarreal: { bg: "#FFE667", fg: "#005187" },
  "real-betis": { bg: "#00954C", fg: "#FFF" },
  "celta-de-vigo": { bg: "#8AC7E8", fg: "#C81C2C" },
  "deportivo-de-la-coruna": { bg: "#0072CE", fg: "#FFF" },
  "rcd-espanyol": { bg: "#005EB8", fg: "#FFF" },
  "real-zaragoza": { bg: "#FFF", fg: "#003DA5" },
  juventus: { bg: "#000", fg: "#FFF" },
  "ac-milan": { bg: "#FB090B", fg: "#000" },
  internazionale: { bg: "#0068A8", fg: "#000" },
  "ssc-napoli": { bg: "#12A0D7", fg: "#FFF" },
  "as-roma": { bg: "#8E1F2F", fg: "#F0BC42" },
  lazio: { bg: "#87CEEB", fg: "#FFF" },
  atalanta: { bg: "#1C1F4F", fg: "#FFF" },
  fiorentina: { bg: "#482F92", fg: "#FFF" },
  torino: { bg: "#8B0000", fg: "#FFF" },
  sampdoria: { bg: "#1F3A93", fg: "#FFF" },
  genoa: { bg: "#C8102E", fg: "#003DA5" },
  bologna: { bg: "#911F2F", fg: "#1B468C" },
  udinese: { bg: "#000", fg: "#FFF" },
  "bayern-munich": { bg: "#DC052D", fg: "#FFF" },
  "borussia-dortmund": { bg: "#FDE100", fg: "#000" },
  "rb-leipzig": { bg: "#DD0741", fg: "#FFF" },
  "bayer-leverkusen": { bg: "#E32221", fg: "#000" },
  "eintracht-frankfurt": { bg: "#E1000F", fg: "#000" },
  "vfb-stuttgart": { bg: "#E32219", fg: "#FFF" },
  "borussia-monchengladbach": { bg: "#000", fg: "#00B050" },
  "werder-bremen": { bg: "#1D9053", fg: "#FFF" },
  "1-fc-koln": { bg: "#ED1C24", fg: "#FFF" },
  "fc-schalke-04": { bg: "#004D9E", fg: "#FFF" },
  "hertha-bsc": { bg: "#005CA9", fg: "#FFF" },
  "hamburger-sv": { bg: "#003C8F", fg: "#FFF" },
  "1-fc-nurnberg": { bg: "#8B1A1A", fg: "#FFF" },
  "vfl-wolfsburg": { bg: "#65B32E", fg: "#FFF" },
  "paris-saint-germain": { bg: "#004170", fg: "#ED1C24" },
  "olympique-marseille": { bg: "#2FAEE0", fg: "#FFF" },
  "as-monaco": { bg: "#ED1C24", fg: "#FFF" },
  "olympique-lyonnais": { bg: "#DA001A", fg: "#1B449C" },
  "lille-osc": { bg: "#DA291C", fg: "#003DA5" },
  "as-saint-etienne": { bg: "#0F8A3F", fg: "#FFF" },
  "rc-lens": { bg: "#FFCC00", fg: "#DA0023" },
  "ogc-nice": { bg: "#ED1C24", fg: "#000" },
  "stade-rennais": { bg: "#D90D2E", fg: "#000" },
  "fc-girondins-de-bordeaux": { bg: "#001489", fg: "#FFF" },
  "fc-nantes": { bg: "#FFCD00", fg: "#008752" },
  "toulouse-fc": { bg: "#5F259F", fg: "#FFF" },
  "montpellier-hsc": { bg: "#F46D1D", fg: "#1F3F88" },
  strasbourg: { bg: "#005EB8", fg: "#FFF" },
};
const PALETTE = [
  { bg: "#15803d", fg: "#ecfdf5" }, { bg: "#7c3aed", fg: "#f5f3ff" },
  { bg: "#0ea5e9", fg: "#f0f9ff" }, { bg: "#ea580c", fg: "#fff7ed" },
  { bg: "#be185d", fg: "#fdf2f8" }, { bg: "#0d9488", fg: "#f0fdfa" },
  { bg: "#a16207", fg: "#fefce8" }, { bg: "#4338ca", fg: "#eef2ff" },
  { bg: "#65a30d", fg: "#f7fee7" }, { bg: "#9d174d", fg: "#fdf2f8" },
  { bg: "#1e3a8a", fg: "#dbeafe" }, { bg: "#525252", fg: "#fafafa" },
];
function colorFor(slug: string) {
  if (CURATED[slug]) return CURATED[slug];
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
function Dot({ slug }: { slug: string }) {
  const c = colorFor(slug);
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ background: c.bg, width: 10, height: 10 }}
      aria-hidden
    />
  );
}

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
                  <li key={c.slug} className="flex items-baseline gap-2">
                    <Dot slug={c.slug} />
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
