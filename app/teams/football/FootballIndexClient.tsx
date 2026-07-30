"use client";

// Client-side filter shell for /teams/football. Country chips (multi-select)
// and season-year filter that limits to clubs active in the selected year.
//
// Active = first_year <= year <= last_year. England clubs additionally show
// their highest tier reached as a label.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Badge } from "@/app/teams/_shared/Badge";
import { getCrest } from "@/lib/teamCrest";
import type { FootballMapPoint } from "./FootballMapInner";

// Leaflet is browser-only; SSR import would crash on window access.
const FootballMap = dynamic(() => import("./FootballMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs animate-pulse"
      style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

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
  lat: number | null;
  lng: number | null;
  tiers: number[];
  first_year: number | null;
  last_year: number | null;
  league_seasons: number;
  tier_by_year: Record<string, number>;
  country_by_year: Record<string, string>;
};

type Props = {
  clubs: IndexClub[];
};

const COUNTRY_ORDER = ["England", "Spain", "Italy", "Germany", "France",
                       "Netherlands", "Portugal", "Scotland"];

// Country palette - chosen for visual distinguishability and a faint nod to
// national-team kit traditions (Three Lions red, Spanish red-orange / La
// Furia, Azzurri / Italian flag green, Mannschaft black-red-gold yellow,
// Les Bleus navy). Shared between the map markers and the country group
// header swatches so the eye can follow a club from the map to the list.
export const COUNTRY_COLORS: Record<string, string> = {
  England:     "#dc2626",  // red
  Spain:       "#f97316",  // orange-red
  Italy:       "#15803d",  // green
  Germany:     "#eab308",  // gold-yellow
  France:      "#1d4ed8",  // navy blue
  Netherlands: "#fb923c",  // bright orange (KNVB)
  Portugal:    "#be123c",  // deep crimson
  Scotland:    "#0ea5e9",  // sky blue (distinct from France navy)
};

// Per-tier shades within each country's hue family. Level 1 is the primary;
// lower tiers lighten progressively so the visual hierarchy maps to the
// pyramid. England and Scotland are wired down their full pyramids; the
// other six countries are L1-only in v0.
const COUNTRY_TIER_COLORS: Record<string, Record<number, string>> = {
  England: {
    1: "#dc2626",  // red-600 (primary)
    2: "#ef4444",  // red-500
    3: "#f87171",  // red-400
    4: "#fca5a5",  // red-300
    5: "#fecaca",  // red-200
  },
  Scotland: {
    1: "#0ea5e9",  // sky-500 (primary)
    2: "#38bdf8",  // sky-400
    3: "#7dd3fc",  // sky-300
    4: "#bae6fd",  // sky-200
  },
  Spain:       { 1: "#f97316" },
  Italy:       { 1: "#15803d" },
  Germany:     { 1: "#eab308" },
  France:      { 1: "#1d4ed8" },
  Netherlands: { 1: "#fb923c" },
  Portugal:    { 1: "#be123c" },
};

// Resolve a marker color from (country, level). Falls back to the country
// primary, then to a neutral grey if the country is unknown.
function colorForCountryTier(country: string, level: number | undefined): string {
  const ramp = COUNTRY_TIER_COLORS[country];
  if (ramp && level !== undefined && ramp[level]) return ramp[level];
  return COUNTRY_COLORS[country] ?? "#525252";
}

// Which tier levels are in scope for each in-scope country. England has
// 1-5 (full pyramid through National League); Scotland has 1-4 (full SPFL
// pyramid). Every other country is L1 only in v0. Drives the Level chip
// row visibility.
const COUNTRY_LEVELS_IN_SCOPE: Record<string, number[]> = {
  England:     [1, 2, 3, 4, 5],
  Scotland:    [1, 2, 3, 4],
  Spain:       [1],
  Italy:       [1],
  Germany:     [1],
  France:      [1],
  Netherlands: [1],
  Portugal:    [1],
};

const TIER_LABEL_BY_COUNTRY: Record<string, Record<number, string>> = {
  England: {
    1: "Premier League / First Division",
    2: "Championship",
    3: "League One",
    4: "League Two",
    5: "National League",
  },
  Scotland: {
    1: "Premiership / Premier Division",
    2: "Championship / First Division",
    3: "League One / Second Division",
    4: "League Two / Third Division",
  },
};

export default function FootballIndexClient({ clubs }: Props) {
  const [countries, setCountries] = useState<Set<string>>(new Set());
  // Multi-select levels. When at least one is on, a club must have played
  // at one of the selected levels (in the selected year if seasonYear is
  // set, otherwise in ANY year). Default empty = all levels.
  const [levels, setLevels] = useState<Set<number>>(new Set());
  // Default to ALL (no year filter). When the user picks a year via the
  // number input or slider, the list filters to clubs active that season
  // and shows their level in parens. The placeholder label below reflects
  // the empty state.
  const [seasonYear, setSeasonYear] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // Country/level/season controls collapse behind this on mobile so the
  // card doesn't open with a wall of chips + a wide slider; search stays
  // visible up top since it's the highest-utility control on a phone.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
  const toggleLevel = (n: number) => {
    const next = new Set(levels);
    if (next.has(n)) next.delete(n); else next.add(n);
    setLevels(next);
  };

  // Per-row country resolver: when a year is selected, prefer the year's
  // country (so Mulhouse 1941 reads as Germany); otherwise use the mode.
  const countryFor = (c: IndexClub, sy: number | null): string =>
    sy !== null ? (c.country_by_year[String(sy)] ?? c.country) : c.country;

  const filtered = useMemo(() => {
    const sy = seasonYear ? parseInt(seasonYear, 10) : null;
    const q = search.trim().toLowerCase();
    return clubs.filter((c) => {
      const effectiveCountry = countryFor(c, sy);
      if (countries.size > 0 && !countries.has(effectiveCountry)) return false;
      if (sy !== null && !Number.isNaN(sy)) {
        // Strict: the club must have a recorded level for that exact year.
        // This drops clubs that were dormant, in a tier outside our scope
        // (e.g. Spanish Segunda), or didn't yet exist that season.
        if (c.tier_by_year[String(sy)] === undefined) return false;
      }
      if (levels.size > 0) {
        // With a year: that year's level must be in the selected set.
        // Without a year: the club must have played at any selected level
        // across its full history.
        if (sy !== null) {
          const lv = c.tier_by_year[String(sy)];
          if (lv === undefined || !levels.has(lv)) return false;
        } else {
          if (!c.tiers.some((t) => levels.has(t))) return false;
        }
      }
      if (q && !c.cur_name.toLowerCase().includes(q) && !(c.metro ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clubs, countries, levels, seasonYear, search]);

  const grouped = useMemo(() => {
    const sy = seasonYear ? parseInt(seasonYear, 10) : null;
    const map = new Map<string, IndexClub[]>();
    for (const c of filtered) {
      const key = countryFor(c, sy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return COUNTRY_ORDER.filter((c) => map.has(c)).map((country) => ({
      country,
      clubs: map.get(country)!.slice().sort((a, b) => {
        // When a season is selected, sort by that year's level ascending
        // (top flight first). When unselected: level of most recent recorded
        // season, then recency descending (so Arsenal 2026 beats Accrington
        // FC 1893 within the same tier), then A-Z.
        const maxYear = (c: IndexClub) => {
          const years = Object.keys(c.tier_by_year).map(Number);
          return years.length ? Math.max(...years) : 0;
        };
        const currentLvl = (c: IndexClub) => {
          const my = maxYear(c);
          return my ? (c.tier_by_year[String(my)] ?? 99) : 99;
        };
        const aLvl = sy !== null ? (a.tier_by_year[String(sy)] ?? 99) : currentLvl(a);
        const bLvl = sy !== null ? (b.tier_by_year[String(sy)] ?? 99) : currentLvl(b);
        if (aLvl !== bLvl) return aLvl - bLvl;
        // Within same level: most recently active first
        if (sy === null) {
          const aYr = maxYear(a), bYr = maxYear(b);
          if (aYr !== bYr) return bYr - aYr;
        }
        return a.cur_name.localeCompare(b.cur_name);
      }),
    }));
  }, [filtered, seasonYear]);

  // Map points: take the filtered set, keep only clubs with usable
  // coordinates, attach a tier-shaded country color. When a year is
  // selected the marker reflects that year's tier; otherwise it reflects
  // the highest tier (lowest level number) the club ever reached.
  const mapPoints: FootballMapPoint[] = useMemo(() => {
    const sy = seasonYear ? parseInt(seasonYear, 10) : null;
    const out: FootballMapPoint[] = [];
    for (const c of filtered) {
      if (c.lat === null || c.lng === null) continue;
      const lvl = sy !== null
        ? c.tier_by_year[String(sy)]
        : (c.tiers.length ? Math.min(...c.tiers) : undefined);
      const effCountry = countryFor(c, sy);
      out.push({
        slug: c.slug,
        cur_name: c.cur_name,
        country: effCountry,
        metro: c.metro,
        lat: c.lat,
        lng: c.lng,
        color: colorForCountryTier(effCountry, lvl),
      });
    }
    return out;
  }, [filtered, seasonYear]);

  // Which Level chips are available given the active country filter.
  // When no country is selected, show the union across all in-scope
  // countries (1-5). When countries are selected, show only the union of
  // their in-scope levels. England is the only country with sub-L1 so any
  // selection that includes England exposes Levels 2-5.
  const visibleLevels = useMemo(() => {
    const activeCountries = countries.size === 0 ? COUNTRY_ORDER : [...countries];
    const set = new Set<number>();
    for (const c of activeCountries) {
      for (const lv of COUNTRY_LEVELS_IN_SCOPE[c] ?? []) set.add(lv);
    }
    return [...set].sort((a, b) => a - b);
  }, [countries]);

  // Auto-prune level selections that fall outside the visible scope when
  // the country filter changes (e.g. user had L3 selected, then narrows
  // to Spain only -> L3 disappears, so drop it from state).
  useEffect(() => {
    if (levels.size === 0) return;
    const visibleSet = new Set(visibleLevels);
    let changed = false;
    const next = new Set<number>();
    for (const lv of levels) {
      if (visibleSet.has(lv)) next.add(lv);
      else changed = true;
    }
    if (changed) setLevels(next);
    // levels intentionally excluded; only react to visibleLevels changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLevels]);

  const totalCount = filtered.length;
  // Map refit triggers ONLY when the country filter changes; levels,
  // year, and search reshape the markers without resetting pan/zoom.
  const mapRefitKey = useMemo(
    () => (countries.size === 0 ? "ALL" : [...countries].sort().join(",")),
    [countries],
  );
  const clearAll = () => { setCountries(new Set()); setLevels(new Set()); setSeasonYear(""); setSearch(""); };
  const anyActive = countries.size > 0 || levels.size > 0 || seasonYear !== "" || search !== "";
  const activeFilterCount = countries.size + levels.size + (seasonYear !== "" ? 1 : 0);

  return (
    <div>
      {/* Map first - so the filter row reads as something the reader applies
          to the map they already see. Always rendered; FootballMapInner
          falls back to a Europe-centered empty view when zero clubs match
          so the layout doesn't reflow as filters change. */}
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", height: 360 }}
      >
        <FootballMap points={mapPoints} refitKey={mapRefitKey} />
      </div>

      <div
        className="rounded-xl border p-4 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Always-visible bar: search (primary control on a phone) + a
            mobile-only toggle that reveals country/level/season filtering.
            Desktop skips the toggle and shows everything inline below. */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search club or metro"
            className="flex-1 sm:max-w-xs text-sm px-3 py-1.5 rounded-md border"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-expanded={mobileFiltersOpen}
            className="sm:hidden inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition flex-shrink-0"
            style={{ background: "var(--bg-card-hover)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            Filters
            {activeFilterCount > 0 && <Badge variant="live">{activeFilterCount}</Badge>}
            <span aria-hidden className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {anyActive && (
            <button
              onClick={clearAll}
              className="hidden sm:inline-flex text-xs px-2.5 py-1 rounded-md border hover:bg-[var(--bg-card-hover)] transition flex-shrink-0"
              style={{ borderColor: "var(--border)" }}
            >
              Clear
            </button>
          )}
        </div>

        <div className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block`}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] mr-1">Country</span>
            {COUNTRY_ORDER.map((c) => {
              const active = countries.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCountry(c)}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ background: COUNTRY_COLORS[c] ?? "#525252", width: 8, height: 8 }}
                    aria-hidden
                  />
                  {c}
                </button>
              );
            })}
          </div>

          {visibleLevels.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
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
                    title={n === 1 ? "Top flight" : `Tier ${n} (English pyramid only outside Level 1)`}
                  >
                    {n}
                  </button>
                );
              })}
              <span className="text-[10px] text-[var(--text-dim)] ml-1">multi-select; Levels 2-5 are England-only in v0</span>
            </div>
          )}

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
              placeholder="ALL"
              className="text-sm px-2 py-1 rounded-md border w-24 tabular-nums"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            {/* Step buttons: -1 / +1 around the slider. Empty seasonYear is
                the ALL sentinel which lives at the maxYear+1 slider position;
                stepping backward from ALL lands on the most recent year,
                stepping forward from maxYear lands back on ALL. */}
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
              title="Previous year"
              className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
            >
              ◀
            </button>
            <input
              type="range"
              min={minYear}
              max={maxYear + 1}
              step={1}
              value={seasonYear ? parseInt(seasonYear, 10) : maxYear + 1}
              onChange={(e) => {
                // Position maxYear+1 = ALL sentinel (slider all the way right).
                const v = parseInt(e.target.value, 10);
                if (v >= maxYear + 1) setSeasonYear("");
                else setSeasonYear(String(v));
              }}
              className="flex-1 min-w-[180px] max-w-md accent-[var(--accent)]"
              aria-label="Season year slider (rightmost position = ALL)"
              title="Drag to a year to filter; slide all the way right for ALL eras"
            />
            <button
              type="button"
              onClick={() => {
                const cur = seasonYear ? parseInt(seasonYear, 10) : maxYear + 1;
                const next = cur + 1;
                if (next >= maxYear + 1) setSeasonYear("");
                else if (next < minYear) setSeasonYear(String(minYear));
                else setSeasonYear(String(next));
              }}
              disabled={seasonYear === ""}
              aria-label="Next year (or ALL)"
              title="Next year (loops back to ALL past the most recent season)"
              className="text-sm px-2 py-1 rounded-md border transition hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text)" }}
            >
              ▶
            </button>
          </div>

          {anyActive && (
            <button
              onClick={clearAll}
              className="sm:hidden mt-3 text-xs px-2.5 py-1 rounded-md border hover:bg-[var(--bg-card-hover)] transition"
              style={{ borderColor: "var(--border)" }}
            >
              Clear all filters
            </button>
          )}
        </div>

        <p className="text-xs text-[var(--text-muted)] mt-3 tabular-nums">
          Showing {totalCount} of {clubs.length} clubs
          {seasonYear
            ? <> active in the {parseInt(seasonYear, 10) - 1}-{String(parseInt(seasonYear, 10)).slice(-2)} season</>
            : <> across all eras (ALL)</>}
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">No clubs match the current filters.</p>
      ) : (
        grouped.map((g) => (
          <details key={g.country} className="mb-8 group"><summary className="text-sm font-semibold mb-2 flex items-center gap-2 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{ background: COUNTRY_COLORS[g.country] ?? "#525252", width: 10, height: 10 }}
                aria-hidden
              />
              <span className="uppercase tracking-wide">{g.country}</span>
              <span className="text-[var(--text-muted)] font-normal tabular-nums">
                {g.clubs.length}
              </span>
            <span aria-hidden className="ml-auto text-[var(--text-muted)] text-xs transition-transform group-open:rotate-180">▾</span></summary>
            <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 text-sm">
              {g.clubs.map((c) => {
                const sy = seasonYear ? parseInt(seasonYear, 10) : null;
                // Show level for the selected year only. If no row exists
                // for that year (club in a tier outside scope or dormant),
                // leave the parenthetical blank per editorial spec.
                const lvl = sy !== null ? c.tier_by_year[String(sy)] : undefined;
                // One marker per club: show the real crest when we have one,
                // otherwise fall back to the colored dot. Never both.
                const hasCrest = !!getCrest(c.cur_name);
                return (
                  <li key={c.slug}>
                    <Link
                      href={`/teams/football/${c.slug}`}
                      className="flex items-baseline gap-2 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-[var(--bg-card-hover)]"
                    >
                      {!hasCrest && <Dot slug={c.slug} />}
                      {hasCrest && <CrestIcon name={c.cur_name} size={16} className="flex-shrink-0" />}
                      <span className="truncate">{c.cur_name}</span>
                      {lvl !== undefined && (
                        <span className="text-[var(--text-muted)] text-xs tabular-nums flex-shrink-0">({lvl})</span>
                      )}
                      <span className="text-[var(--text-muted)] text-xs ml-auto flex-shrink-0 truncate max-w-[40%]">{c.metro}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))
      )}
    </div>
  );
}
