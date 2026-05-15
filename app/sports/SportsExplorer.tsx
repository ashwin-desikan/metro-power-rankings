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
  league_raw?: string;
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

// Conference -> ring color. Used on the map for FBS football and NCAA
// Division I basketball rows; rows whose `league` field isn't in this
// map fall back to SPORT_COLORS[t.sport]. Hues chosen for max
// at-a-glance separation on the dark basemap and to avoid collision
// with existing sport hues. The Big East / A-10 / WCC etc. only carry
// teams on the basketball side; the four P4 names cover both sports.
export const CONFERENCE_COLORS: Record<string, string> = {
  // Power 4
  "Big Ten":              "#2563eb", // blue-600
  "Southeastern":         "#f59e0b", // amber-500 (SEC gold)
  "Big 12":               "#dc2626", // red-600
  "Atlantic Coast":       "#c026d3", // fuchsia-600
  // G5 / mid-majors that also exist on the basketball side
  "Big East":             "#7c3aed", // violet-600
  "American Athletic":    "#0891b2", // cyan-600
  "Mountain West":        "#ea580c", // orange-600
  "Sun Belt":             "#a16207", // yellow-700
  "Mid-American":         "#be123c", // rose-700
  "Conference USA":       "#65a30d", // lime-600
  "Pacific-12":           "#be185d", // pink-700
  // Basketball-only majors
  "Atlantic 10":          "#84cc16", // lime-500
  "West Coast":           "#6366f1", // indigo-500
  "Big West":             "#0e7490", // cyan-700
  "Horizon":              "#5b21b6", // violet-800
  "Missouri Valley":      "#15803d", // green-700
};

// Power 4 = the four autonomy / revenue-driving conferences. Used as a
// quick-filter preset that crosses both FBS football and NCAA Division I
// basketball in one click. Workbook stores them under their full
// conference names; UI uses the same strings.
const POWER_4_LEAGUES = ["Big Ten", "Southeastern", "Big 12", "Atlantic Coast"] as const;
const POWER_4_SET = new Set<string>(POWER_4_LEAGUES);

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

  // College filter chips. Default behavior is a Power 4 cap on both
  // FBS football and NCAA Division I basketball; expander chips relax
  // that cap per sport.
  //   - p4Default (default ON,  url `p4=0` opts out)
  //   - showAllFbs (default OFF, url `fbs=all` opts in)
  //   - showAllNcaaHoops (default OFF, url `cbb=all` opts in)
  // Logic: a college row is hidden only if p4Default is ON, its sport's
  // expander is OFF, and its conference is not in POWER_4_SET.
  const [p4Default, setP4Default] = useState<boolean>(
    searchParams.get("p4") !== "0",
  );
  const [showAllFbs, setShowAllFbs] = useState<boolean>(
    searchParams.get("fbs") === "all",
  );
  const [showAllNcaaHoops, setShowAllNcaaHoops] = useState<boolean>(
    searchParams.get("cbb") === "all",
  );

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
    if (!p4Default) params.set("p4", "0");
    if (showAllFbs) params.set("fbs", "all");
    if (showAllNcaaHoops) params.set("cbb", "all");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, query, p4Default, showAllFbs, showAllNcaaHoops, pathname, router]);

  // ---- College gate predicate (declared early so facets can use it) ----
  // A row is hidden by the college gate iff: p4Default is ON, the row
  // is a college row (FBS football or NCAA D-I basketball), its sport's
  // expander is OFF, and its conference is not Power 4.
  const collegeGateHides = useMemo(() => {
    return (t: TeamMarker): boolean => {
      if (!p4Default) return false;
      const isFbs = t.league_raw === "FBS";
      const isNcaaHoops = t.sport === "Basketball" && t.league_raw === "NCAA";
      if (!isFbs && !isNcaaHoops) return false;
      if (isFbs && showAllFbs) return false;
      if (isNcaaHoops && showAllNcaaHoops) return false;
      return !POWER_4_SET.has(t.league);
    };
  }, [p4Default, showAllFbs, showAllNcaaHoops]);

  // ---- Derived facets ----
  // All three facet lists cross-filter: each list reflects the rows that
  // would survive every OTHER filter group plus the college gate. So
  // selecting Sport=American Football shrinks Country and League to the
  // countries / leagues that actually carry an American Football row.
  const sportFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (collegeGateHides(t)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      counts.set(t.sport, (counts.get(t.sport) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, collegeGateHides, filters.leagues, filters.countries]);

  const leagueFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (collegeGateHides(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      counts.set(t.league, (counts.get(t.league) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, collegeGateHides, filters.sports, filters.countries]);

  const countryFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (collegeGateHides(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      counts.set(t.country, (counts.get(t.country) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, collegeGateHides, filters.sports, filters.leagues]);

  // ---- Visible markers (after filtering) ----
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (collegeGateHides(t)) return false;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) return false;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) return false;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) return false;
      if (q) {
        const haystack = `${t.team} ${t.city ?? ""} ${t.metro ?? ""} ${t.league}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [teams, filters, query, collegeGateHides]);

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
    setP4Default(true);
    setShowAllFbs(false);
    setShowAllNcaaHoops(false);
  }

  // College chip helpers. Counts shown as context anchors next to each
  // chip label.
  const power4Count = useMemo(
    () => teams.filter((t) => POWER_4_SET.has(t.league)).length,
    [teams],
  );
  const fbsCount = useMemo(
    () => teams.filter((t) => t.league_raw === "FBS").length,
    [teams],
  );
  const ncaaHoopsCount = useMemo(
    () => teams.filter((t) => t.sport === "Basketball" && t.league_raw === "NCAA").length,
    [teams],
  );

  const hasFilters =
    filters.sports.size + filters.leagues.size + filters.countries.size > 0 ||
    query.trim().length > 0 ||
    !p4Default ||
    showAllFbs ||
    showAllNcaaHoops;

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
          dropped. Sport is the primary discriminator; League, Country,
          and the college chips live one level deeper inside More filters. */}
      <FilterRow
        label="Sport"
        facets={sportFacets}
        active={filters.sports}
        onToggle={(v) => toggle("sports", v)}
        renderDot={(name) => SPORT_COLORS[name] || DEFAULT_SPORT_COLOR}
      />

      <details className="rounded-lg border" style={{ borderColor: "var(--border)" }} open>
        <summary className="cursor-pointer px-4 py-2 text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] flex items-center justify-between hover:text-[var(--text)]">
          <span>More filters</span>
          <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">
            {filters.leagues.size + filters.countries.size + (p4Default ? 1 : 0) + (showAllFbs ? 1 : 0) + (showAllNcaaHoops ? 1 : 0)} active
          </span>
        </summary>
        <div className="px-4 pb-4 space-y-3">
          {/* College chip row. Power 4 caps FBS football + NCAA D-I
              basketball to the four autonomy conferences. The two
              expander chips relax that cap per sport. */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-1.5">College</div>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip
                label="Power 4"
                count={power4Count}
                active={p4Default}
                onClick={() => setP4Default((v) => !v)}
                title={p4Default
                  ? "On: FBS football and NCAA Division I basketball capped to Big Ten, SEC, Big 12, ACC."
                  : "Off: showing every FBS football and NCAA basketball school. Click to re-apply the Power 4 cap."}
              />
              <ToggleChip
                label="NCAA FBS"
                count={fbsCount}
                active={showAllFbs}
                onClick={() => setShowAllFbs((v) => !v)}
                title={showAllFbs
                  ? "On: showing all FBS football schools. Click to revert to the Power 4 cap."
                  : "Off: FBS football is capped to Power 4 conferences. Click to show every FBS school."}
              />
              <ToggleChip
                label="NCAA Division I"
                count={ncaaHoopsCount}
                active={showAllNcaaHoops}
                onClick={() => setShowAllNcaaHoops((v) => !v)}
                title={showAllNcaaHoops
                  ? "On: showing all NCAA Division I basketball schools. Click to revert to the Power 4 cap."
                  : "Off: NCAA basketball is capped to Power 4 conferences. Click to show every D-I school."}
              />
            </div>
          </div>
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

function ToggleChip({
  label,
  count,
  active,
  onClick,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
        active
          ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
          : "hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
      style={!active ? { borderColor: "var(--border)", color: "var(--text-muted)" } : undefined}
    >
      <span>{label}</span>
      <span className="opacity-70 tabular-nums">{count}</span>
    </button>
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
