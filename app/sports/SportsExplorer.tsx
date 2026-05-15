"use client";

// SportsExplorer — client-side filter + map + search surface for /sports.
//
// Filter state lives in React + URL search params so deep-links share a
// pre-filtered view. The Leaflet map is dynamic-imported (ssr:false)
// behind a wrapper so SSR doesn't try to touch `window`.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";

export type TeamMarker = {
  sport: string;
  league: string;
  team: string;
  main_div: string | null;
  division: string | null;
  city: string | null;
  metro: string | null;
  metro_slug: string | null;
  state: string | null;
  country: string;
  country_iso2: string | null;
  level: "Major" | "Other";
  lat: number;
  lng: number;
  wikidata_qid: string | null;
  wikipedia_url: string | null;
  team_page_url: string | null;
  source: "team_list" | "football_club_data";
};

// Sport -> ring color. Fill color is always Level-coded so two channels
// stack: gold (Major) vs slate (Other) inside, sport-colored ring outside.
// Palette picks deliberately high-contrast hues to disambiguate at global
// zoom; tweak by editing SPORT_COLORS only.
export const SPORT_COLORS: Record<string, string> = {
  "American Football":  "#b45309", // amber-700
  "Baseball":           "#b91c1c", // red-700
  "Basketball":         "#ea580c", // orange-600
  "Hockey":             "#0369a1", // sky-700 (ice)
  "Football":           "#15803d", // green-700
  "Rugby Union":        "#166534", // green-800
  "Rugby League":       "#65a30d", // lime-600
  "T20 Cricket":        "#0e7490", // cyan-700
  "Test Cricket":       "#155e75", // cyan-800
  "Aussie Rules":       "#4338ca", // indigo-700
  "W Football":         "#be185d", // pink-700
  "W Basketball":       "#9d174d", // rose-800
  "Volleyball":         "#0f766e", // teal-700
  "Handball":           "#6d28d9", // purple-700
  "Canadian Football":  "#92400e", // amber-800
  "Golf":               "#14532d", // green-900
  "Tennis":             "#84cc16", // lime-500
  "Motor Racing":       "#1f2937", // slate-800
  "Auto Racing":        "#1f2937",
  "Horse Racing":       "#78350f", // amber-900
};
export const DEFAULT_SPORT_COLOR = "#475569"; // slate-600

const SportsMapInner = dynamic(() => import("./SportsMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs"
      style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

type FilterState = {
  sports: Set<string>;
  leagues: Set<string>;
  countries: Set<string>;
};

function parseSetParam(s: string | null): Set<string> {
  if (!s) return new Set();
  return new Set(s.split(",").filter(Boolean));
}
function stringifySet(s: Set<string>): string | null {
  if (s.size === 0) return null;
  return Array.from(s).join(",");
}

export default function SportsExplorer({ teams }: { teams: TeamMarker[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- Filter state (rehydrated from URL on first paint) ----
  const [filters, setFilters] = useState<FilterState>(() => ({
    sports:    parseSetParam(searchParams.get("sport")),
    leagues:   parseSetParam(searchParams.get("league")),
    countries: parseSetParam(searchParams.get("country")),
  }));
  const [query, setQuery] = useState<string>(searchParams.get("q") || "");

  // Push filter changes to URL (replace, not push, to keep history clean)
  useEffect(() => {
    const params = new URLSearchParams();
    const s = stringifySet(filters.sports);
    const l = stringifySet(filters.leagues);
    const c = stringifySet(filters.countries);
    if (s) params.set("sport", s);
    if (l) params.set("league", l);
    if (c) params.set("country", c);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, query, pathname, router]);

  // ---- Derived facets ----
  // Sport list (descending by count) and country list (descending by count).
  // League list is dependent on selected sports.
  const sportFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) counts.set(t.sport, (counts.get(t.sport) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams]);

  const leagueFacets = useMemo(() => {
    const visibleSports = filters.sports;
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (visibleSports.size > 0 && !visibleSports.has(t.sport)) continue;
      counts.set(t.league, (counts.get(t.league) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, filters.sports]);

  const countryFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) counts.set(t.country, (counts.get(t.country) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams]);

  // ---- Visible markers (after filtering) ----
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) return false;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) return false;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) return false;
      if (q) {
        const haystack = `${t.team} ${t.city ?? ""} ${t.metro ?? ""} ${t.league}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [teams, filters, query]);

  // ---- Search dropdown (top matches by team/metro substring) ----
  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches: TeamMarker[] = [];
    for (const t of teams) {
      const haystack = `${t.team} ${t.city ?? ""} ${t.metro ?? ""}`.toLowerCase();
      if (haystack.includes(q)) matches.push(t);
      if (matches.length >= 7) break;
    }
    return matches;
  }, [teams, query]);

  // ---- Filter toggle helpers ----
  function toggle(group: keyof FilterState, value: string) {
    setFilters((prev) => {
      const next = new Set(prev[group]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      // Clearing sport selection also clears any leagues no longer reachable
      if (group === "sports") {
        const reachableLeagues = new Set(
          teams
            .filter((t) => next.size === 0 || next.has(t.sport))
            .map((t) => t.league),
        );
        const filteredLeagues = new Set(Array.from(prev.leagues).filter((l) => reachableLeagues.has(l)));
        return { ...prev, sports: next, leagues: filteredLeagues };
      }
      return { ...prev, [group]: next };
    });
  }
  function clearAll() {
    setFilters({ sports: new Set(), leagues: new Set(), countries: new Set() });
    setQuery("");
  }

  const hasFilters = filters.sports.size + filters.leagues.size + filters.countries.size > 0 || query.trim().length > 0;

  return (
    <section className="space-y-3">
      {/* Search + result count */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search team, city, or metro…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-transparent text-sm focus:outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Search teams"
          />
          {searchMatches.length > 0 && query.trim().length >= 2 && (
            <div
              className="absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {searchMatches.map((m, i) => {
                const inner = (
                  <div className="px-3 py-2 hover:bg-[var(--bg-card-hover)] flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.team}</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {m.league} · {m.metro || m.city || m.country}
                      </div>
                    </div>
                    {m.team_page_url ? (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--accent)]">Open</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">No page</span>
                    )}
                  </div>
                );
                return m.team_page_url ? (
                  <Link key={i} href={m.team_page_url}>{inner}</Link>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">
          Showing <strong className="text-[var(--text)]">{visible.length.toLocaleString()}</strong> of {teams.length.toLocaleString()}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-3 underline decoration-dotted hover:text-[var(--accent)]"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Map */}
      <div
        style={{ height: 540 }}
        className="rounded-lg overflow-hidden border"
      >
        <SportsMapInner markers={visible} />
      </div>

      {/* Sport filter — sits below the map. Chips already carry the sport
          color dot, so the separate legend block was redundant and was
          dropped. Sport is the primary discriminator; League and Country
          live one level deeper inside the More filters disclosure. */}
      <FilterRow
        label="Sport"
        facets={sportFacets}
        active={filters.sports}
        onToggle={(v) => toggle("sports", v)}
        renderDot={(name) => SPORT_COLORS[name] || DEFAULT_SPORT_COLOR}
      />

      <details className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <summary className="cursor-pointer px-4 py-2 text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] flex items-center justify-between hover:text-[var(--text)]">
          <span>More filters</span>
          <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">
            {filters.leagues.size + filters.countries.size} active
          </span>
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <FilterRow label="League" facets={leagueFacets} active={filters.leagues} onToggle={(v) => toggle("leagues", v)} />
          <FilterRow label="Country" facets={countryFacets.slice(0, 30)} active={filters.countries} onToggle={(v) => toggle("countries", v)} />
        </div>
      </details>

      {/* Dropped legend block — the Sport chip row already shows the dot
          + sport name + count, so a separate color key was duplicative.
          Keeping this empty placeholder so the diff is small. */}
      <div className="hidden">
        {sportFacets.map(([s]) => (
          <span key={s}>
            <span
              aria-hidden
              style={{ borderColor: SPORT_COLORS[s] || DEFAULT_SPORT_COLOR }}
            />
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

function FilterRow({
  label,
  facets,
  active,
  onToggle,
  renderDot,
}: {
  label: string;
  facets: [string, number][];
  active: Set<string>;
  onToggle: (v: string) => void;
  renderDot?: (name: string) => string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {facets.map(([name, count]) => {
          const isActive = active.has(name);
          return (
            <button
              key={name}
              onClick={() => onToggle(name)}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                isActive
                  ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                  : "hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
              style={!isActive ? { borderColor: "var(--border)", color: "var(--text-muted)" } : undefined}
            >
              {renderDot && (
                <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: renderDot(name) }} />
              )}
              <span>{name}</span>
              <span className="opacity-70 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
