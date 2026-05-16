"use client";

// SportsExplorer — client-side filter + map + search surface for /sports.
//
// Filter state lives in React + URL search params so deep-links share a
// pre-filtered view. The Leaflet map is dynamic-imported (ssr:false)
// behind a wrapper so SSR doesn't try to touch `window`.

import { useEffect, useMemo, useState } from "react";
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
  federation?: string | null; // UEFA / CONMEBOL / CONCACAF / AFC / CAF / OFC for national-team rows
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
// map fall back to SPORT_COLORS[t.sport].
export const CONFERENCE_COLORS: Record<string, string> = {
  "Big Ten":              "#2563eb", // blue-600
  "Southeastern":         "#f59e0b", // amber-500 (SEC gold)
  "Big 12":               "#dc2626", // red-600
  "Atlantic Coast":       "#c026d3", // fuchsia-600
  "Big East":             "#7c3aed", // violet-600
  "American Athletic":    "#0891b2", // cyan-600
  "Mountain West":        "#ea580c", // orange-600
  "Sun Belt":             "#a16207", // yellow-700
  "Mid-American":         "#be123c", // rose-700
  "Conference USA":       "#65a30d", // lime-600
  "Pacific-12":           "#be185d", // pink-700
  "Atlantic 10":          "#84cc16", // lime-500
  "West Coast":           "#6366f1", // indigo-500
  "Big West":             "#0e7490", // cyan-700
  "Horizon":              "#5b21b6", // violet-800
  "Missouri Valley":      "#15803d", // green-700
};

// Crown Jewels = the apex top-flight competition in each sport. Used by
// the Crown Jewels preset and for the crown emoji on League facets.
// Scoped per sport so the country-named Football leagues (England / Spain /
// Italy / France / Germany == Premier League / La Liga / etc) do not bleed
// into W Football, where the country-named workbook entries are the women's
// domestic leagues and WSL / NWSL are the actual top flight.
export const CROWN_LEAGUES_BY_SPORT: Record<string, ReadonlySet<string>> = {
  "Football":          new Set(["England", "Spain", "Italy", "France", "Germany"]),
  "American Football": new Set(["NFL"]),
  "Baseball":          new Set(["MLB"]),
  "Basketball":        new Set(["NBA"]),
  "Hockey":            new Set(["NHL"]),
  "Canadian Football": new Set(["CFL"]),
  "Rugby Union":       new Set(["Top 14"]),
  "W Football":        new Set(["WSL", "NWSL"]),
  "Volleyball":        new Set(["Superlega"]),
  "Rugby League":      new Set(["NRL"]),
  "Aussie Rules":      new Set(["AFL"]),
  "Handball":          new Set(["Handball-Bundesliga"]),
  "W Basketball":      new Set(["WNBA"]),
  "T20 Cricket":       new Set(["IPL"]),
};

export function isCrownLeague(sport: string, league: string): boolean {
  return CROWN_LEAGUES_BY_SPORT[sport]?.has(league) ?? false;
}

// Power Conferences = the additive overlay that brings the recognizable
// US college schools into the default first-paint view. Football uses
// the four FBS autonomy conferences; basketball adds Big East to those.
const POWER_CONF_FBS_LEAGUES = ["Big Ten", "Southeastern", "Big 12", "Atlantic Coast"] as const;
const POWER_CONF_CBB_LEAGUES = ["Big Ten", "Southeastern", "Big 12", "Atlantic Coast", "Big East"] as const;
const POWER_CONF_FBS_SET = new Set<string>(POWER_CONF_FBS_LEAGUES);
const POWER_CONF_CBB_SET = new Set<string>(POWER_CONF_CBB_LEAGUES);

function isPowerConferences(t: TeamMarker): boolean {
  if (t.league_raw === "FBS" && POWER_CONF_FBS_SET.has(t.league)) return true;
  if (t.sport === "Basketball" && t.league_raw === "NCAA" && POWER_CONF_CBB_SET.has(t.league)) return true;
  return false;
}

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

// Preset values that drive the visible-set gate. Mutually exclusive.
//   crown  = level == 'Major' AND CROWN_LEAGUES.has(league)
//   major  = level == 'Major'  (the default first paint)
//   other  = level == 'Other'
//   all    = no level filter
type Preset = "crown" | "major" | "other" | "all";
const DEFAULT_PRESET: Preset = "major";

type FilterState = {
  sports: Set<string>;
  leagues: Set<string>;
  countries: Set<string>;
  federations: Set<string>;
  levels: Set<string>;
};

// Federation chip order: biggest member set first, OFC last. Used by
// both the facet ordering and the chip row in the UI.
const FEDERATION_ORDER = ["UEFA", "CAF", "AFC", "CONCACAF", "CONMEBOL", "OFC"] as const;

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
    sports:      parseSetParam(searchParams.get("sport")),
    leagues:     parseSetParam(searchParams.get("league")),
    countries:   parseSetParam(searchParams.get("country")),
    federations: parseSetParam(searchParams.get("fed")),
    levels:      parseSetParam(searchParams.get("level")),
  }));
  const [query, setQuery] = useState<string>(searchParams.get("q") || "");

  // Preset (mutually exclusive). Default: major.
  const [preset, setPreset] = useState<Preset>(() => {
    const p = searchParams.get("preset");
    if (p === "crown" || p === "major" || p === "other" || p === "all") return p;
    return DEFAULT_PRESET;
  });

  // Additive: when on, layers Power Conferences college markers (Big Ten,
  // SEC, Big 12, ACC football + Big East-inclusive Big 5 hoops) on top of
  // whatever preset is selected. Default ON. Auto-hidden under Other / All
  // because college is already in scope there.
  const [addPower, setAddPower] = useState<boolean>(
    searchParams.get("power") !== "0",
  );

  // Push filter changes to URL (replace, not push, to keep history clean)
  useEffect(() => {
    const params = new URLSearchParams();
    const s = stringifySet(filters.sports);
    const l = stringifySet(filters.leagues);
    const c = stringifySet(filters.countries);
    const fed = stringifySet(filters.federations);
    const lev = stringifySet(filters.levels);
    if (s) params.set("sport", s);
    if (l) params.set("league", l);
    if (c) params.set("country", c);
    if (fed) params.set("fed", fed);
    if (lev) params.set("level", lev);
    if (query.trim()) params.set("q", query.trim());
    if (preset !== DEFAULT_PRESET) params.set("preset", preset);
    if (!addPower) params.set("power", "0");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, query, preset, addPower, pathname, router]);

  // ---- Preset gate ----
  // Returns true if the marker passes the active preset, factoring in the
  // additive Power Conferences override. Used by every downstream facet
  // computation and the visible-markers filter so the entire UI stays in
  // lockstep with the preset.
  const presetIncludes = useMemo(() => {
    return (t: TeamMarker): boolean => {
      // Power Conferences additive: lit when addPower is on AND the row is
      // a Power Conferences row. Only meaningful for crown / major (where
      // college would otherwise be entirely excluded).
      if (addPower && isPowerConferences(t)) return true;
      switch (preset) {
        case "crown": return t.level === "Major" && isCrownLeague(t.sport, t.league);
        case "major": return t.level === "Major";
        case "other": return t.level === "Other";
        case "all":   return true;
      }
    };
  }, [preset, addPower]);

  // ---- Derived facets ----
  // All three facet lists cross-filter: each list reflects the rows that
  // would survive every OTHER filter group plus the preset gate. So
  // selecting Sport=American Football shrinks Country and League to the
  // countries / leagues that actually carry an American Football row.
  // Out-of-scope chips (count == 0) are hidden by the parent facet array.
  const sportFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      counts.set(t.sport, (counts.get(t.sport) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, presetIncludes, filters.leagues, filters.countries]);

  // League facets emit [name, count] tuples sorted by tier then count desc:
  //   tier 0 = Crown Jewels (apex of sport)
  //   tier 1 = Major League (workbook ml=Y or Euroleague, non-crown)
  //   tier 2 = Other (college, minor, junior, lower-flight football)
  // crownLeagueFlags and majorLeagueFlags are surfaced separately so the
  // FilterRow's renderCrown / renderMajor helpers know which chips to badge.
  const leagueFacetData = useMemo(() => {
    const counts = new Map<string, number>();
    const crown = new Set<string>();
    const major = new Set<string>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      counts.set(t.league, (counts.get(t.league) || 0) + 1);
      if (isCrownLeague(t.sport, t.league)) crown.add(t.league);
      if (t.level === "Major") major.add(t.league);
    }
    function tier(league: string): number {
      if (crown.has(league)) return 0;
      if (major.has(league)) return 1;
      return 2;
    }
    const facets = Array.from(counts.entries()).sort((a, b) => {
      const ta = tier(a[0]);
      const tb = tier(b[0]);
      if (ta !== tb) return ta - tb;
      return b[1] - a[1];
    });
    return { facets, crown, major };
  }, [teams, presetIncludes, filters.sports, filters.countries]);
  const leagueFacets = leagueFacetData.facets;
  const crownLeagueFlags = leagueFacetData.crown;
  const majorLeagueFlags = leagueFacetData.major;

  const countryFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      counts.set(t.country, (counts.get(t.country) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [teams, presetIncludes, filters.sports, filters.leagues]);

  // Federation facets — only meaningful when 'International Teams' is in the
  // active league filter. Cross-scopes against every other filter group and
  // the preset. Ordered geographically (largest member set first, OFC last).
  const federationFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (!t.federation) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      counts.set(t.federation, (counts.get(t.federation) || 0) + 1);
    }
    return FEDERATION_ORDER
      .filter((f) => counts.has(f))
      .map((f) => [f, counts.get(f)!] as [string, number]);
  }, [teams, presetIncludes, filters.sports, filters.leagues, filters.countries]);

  // Level facets — Major / Other tiers within the current visible scope.
  // Only renders the row when 2+ levels survive (otherwise the chip would
  // be a single no-op choice).
  const levelFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      if (filters.federations.size > 0 && (!t.federation || !filters.federations.has(t.federation))) continue;
      counts.set(t.level, (counts.get(t.level) || 0) + 1);
    }
    return (["Major", "Other"] as const)
      .filter((l) => counts.has(l))
      .map((l) => [l, counts.get(l)!] as [string, number]);
  }, [teams, presetIncludes, filters.sports, filters.leagues, filters.countries, filters.federations]);

  // ---- Visible markers (after filtering) ----
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (!presetIncludes(t)) return false;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) return false;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) return false;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) return false;
      if (filters.federations.size > 0 && (!t.federation || !filters.federations.has(t.federation))) return false;
      if (filters.levels.size > 0 && !filters.levels.has(t.level)) return false;
      if (q) {
        const haystack = `${t.team} ${t.city ?? ""} ${t.metro ?? ""} ${t.league}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [teams, filters, query, presetIncludes]);

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
      // When the user removes 'International Teams' from the league filter,
      // also clear the federation sub-filter — otherwise stale chips would
      // silently keep narrowing the visible set with no UI to clear them.
      if (group === "leagues" && value === "International Teams" && !next.has("International Teams")) {
        return { ...prev, leagues: next, federations: new Set() };
      }
      return { ...prev, [group]: next };
    });
  }
  function clearGroup(group: keyof FilterState) {
    setFilters((prev) => ({ ...prev, [group]: new Set() }));
  }
  function clearAll() {
    setFilters({ sports: new Set(), leagues: new Set(), countries: new Set(), federations: new Set(), levels: new Set() });
    setQuery("");
    setPreset(DEFAULT_PRESET);
    setAddPower(true);
  }

  // ---- Preset chip counts (raw, not preset-gated) ----
  const crownCount = useMemo(
    () => teams.filter((t) => t.level === "Major" && isCrownLeague(t.sport, t.league)).length,
    [teams],
  );
  const majorCount = useMemo(() => teams.filter((t) => t.level === "Major").length, [teams]);
  const otherCount = useMemo(() => teams.filter((t) => t.level === "Other").length, [teams]);
  const allCount = teams.length;
  const powerCount = useMemo(() => teams.filter(isPowerConferences).length, [teams]);

  // Power additive chip only renders for presets that exclude college by
  // default; under Other / All it would be a no-op since college is in scope.
  const showPowerAdditive = preset === "crown" || preset === "major";

  const hasFilters =
    filters.sports.size + filters.leagues.size + filters.countries.size + filters.federations.size + filters.levels.size > 0 ||
    query.trim().length > 0 ||
    preset !== DEFAULT_PRESET ||
    !addPower;

  // Each row's chips are "lit" (third visual state) when the visible
  // map set is being narrowed by something OTHER than this row. This
  // makes cross-scoping visible: pick Sport=Football and the Country
  // chips that remain glow to confirm "these are your candidates".
  const sportRowLit =
    preset !== DEFAULT_PRESET || !addPower || filters.leagues.size > 0 || filters.countries.size > 0 || filters.federations.size > 0 || filters.levels.size > 0 || query.trim().length > 0;
  const countryRowLit =
    preset !== DEFAULT_PRESET || !addPower || filters.sports.size > 0 || filters.leagues.size > 0 || filters.federations.size > 0 || filters.levels.size > 0 || query.trim().length > 0;
  const leagueRowLit =
    preset !== DEFAULT_PRESET || !addPower || filters.sports.size > 0 || filters.countries.size > 0 || filters.federations.size > 0 || filters.levels.size > 0 || query.trim().length > 0;
  const federationRowLit =
    preset !== DEFAULT_PRESET || !addPower || filters.sports.size > 0 || filters.leagues.size > 0 || filters.countries.size > 0 || filters.levels.size > 0 || query.trim().length > 0;
  const levelRowLit =
    preset !== DEFAULT_PRESET || !addPower || filters.sports.size > 0 || filters.leagues.size > 0 || filters.countries.size > 0 || filters.federations.size > 0 || query.trim().length > 0;

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

      {/* Preset row — mutually exclusive. Crown Jewels = top-flight per sport;
          Major League = workbook 'Major League' = Y; Other = everything else
          (college, minor, junior, lower-flight football); All = both combined.
          A separate additive chip layers Power Conferences college on top of
          Crown / Major (auto-hidden under Other / All). */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Preset</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <PresetChip
            label="Crown Jewels"
            count={crownCount}
            active={preset === "crown"}
            onClick={() => setPreset("crown")}
            crown
            title="The world's top-flight competition in each sport: NBA, NFL, NHL, MLB, CFL, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Top 14, WSL, NWSL, Superlega, NRL, AFL, Handball-Bundesliga, WNBA, IPL."
          />
          <PresetChip
            label="Major League"
            count={majorCount}
            active={preset === "major"}
            onClick={() => setPreset("major")}
            title="Every workbook Major League top-flight team across all sports."
          />
          <PresetChip
            label="Other Teams"
            count={otherCount}
            active={preset === "other"}
            onClick={() => setPreset("other")}
            title="Every other team: college (FBS, NCAA D-I, FCS, College Hockey, NCAA W), Minor League, Junior, lower-flight football, second-tier international leagues."
          />
          <PresetChip
            label="All Teams"
            count={allCount}
            active={preset === "all"}
            onClick={() => setPreset("all")}
            title="Everything on file: Major League + Other combined."
          />
          {showPowerAdditive && (
            <button
              type="button"
              onClick={() => setAddPower((v) => !v)}
              aria-pressed={addPower}
              title={
                addPower
                  ? "On: NCAA Power Conferences (Big Ten, SEC, Big 12, ACC football + Big East-inclusive Big 5 hoops) are layered on top of the preset. Click to remove."
                  : "Off: click to layer NCAA Power Conferences on top of the preset."
              }
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ml-2 ${
                addPower
                  ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
                  : "hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
              style={!addPower ? { borderColor: "var(--border)", color: "var(--text-muted)" } : undefined}
            >
              <span>+ NCAA Power Conferences</span>
              <span className="opacity-70 tabular-nums">{powerCount}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sport filter */}
      <FilterRow
        label="Sport"
        facets={sportFacets}
        active={filters.sports}
        onToggle={(v) => toggle("sports", v)}
        onClearGroup={() => clearGroup("sports")}
        litWhenUnselected={sportRowLit}
        renderDot={(name) => SPORT_COLORS[name] || DEFAULT_SPORT_COLOR}
      />

      {/* Country filter */}
      <FilterRow
        label="Country"
        facets={countryFacets.slice(0, 30)}
        active={filters.countries}
        onToggle={(v) => toggle("countries", v)}
        onClearGroup={() => clearGroup("countries")}
        litWhenUnselected={countryRowLit}
      />

      {/* League filter — appears once Sport or Country is selected.
          Crown leagues prefixed with 👑, non-crown Major League leagues
          with 🥈. Sort tier: crown > major > other, then count desc. */}
      {(filters.sports.size > 0 || filters.countries.size > 0) && (
        <FilterRow
          label="League"
          facets={leagueFacets}
          active={filters.leagues}
          onToggle={(v) => toggle("leagues", v)}
          onClearGroup={() => clearGroup("leagues")}
          litWhenUnselected={leagueRowLit}
          renderCrown={(name) => crownLeagueFlags.has(name)}
          renderMajor={(name) => majorLeagueFlags.has(name)}
        />
      )}

      {/* Federation filter — only when 'International Teams' is in the
          active league filter. Maps to FIFA confederations using workbook
          continent (Israel/Kazakhstan -> UEFA, Australia -> AFC, Suriname
          -> CONCACAF). */}
      {filters.leagues.has("International Teams") && federationFacets.length > 0 && (
        <FilterRow
          label="Federation"
          facets={federationFacets}
          active={filters.federations}
          onToggle={(v) => toggle("federations", v)}
          onClearGroup={() => clearGroup("federations")}
          litWhenUnselected={federationRowLit}
        />
      )}

      {/* Level filter — Major / Other. Only shows when 2+ levels survive
          the upstream filters (preset / sport / country / league /
          federation), otherwise the chip is a single no-op choice. */}
      {levelFacets.length >= 2 && (
        <FilterRow
          label="Level"
          facets={levelFacets}
          active={filters.levels}
          onToggle={(v) => toggle("levels", v)}
          onClearGroup={() => clearGroup("levels")}
          litWhenUnselected={levelRowLit}
        />
      )}
    </section>
  );
}

// PresetChip — used for the four mutually exclusive preset toggles.
// Selected uses full accent background; unselected uses border-only.
function PresetChip({
  label,
  count,
  active,
  onClick,
  crown,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  crown?: boolean;
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
      {crown && <span aria-hidden className="text-[10px] leading-none">👑</span>}
      <span>{label}</span>
      <span className="opacity-70 tabular-nums">{count}</span>
    </button>
  );
}

// FilterRow — single rendering primitive for Sport, Country, and League.
// Three visual states per chip:
//   - selected: full accent background, white text
//   - lit (litWhenUnselected && !selected): muted-accent border + brighter text
//     (signals "the visible set is being narrowed by another filter")
//   - idle (!litWhenUnselected && !selected): muted border + muted text
//
// Per-group Clear all link appears next to the label when the group has
// at least one selection.
function FilterRow({
  label,
  facets,
  active,
  onToggle,
  onClearGroup,
  litWhenUnselected,
  renderDot,
  renderCrown,
  renderMajor,
}: {
  label: string;
  facets: [string, number][];
  active: Set<string>;
  onToggle: (v: string) => void;
  onClearGroup: () => void;
  litWhenUnselected: boolean;
  renderDot?: (name: string) => string;
  renderCrown?: (name: string) => boolean;
  renderMajor?: (name: string) => boolean;
}) {
  if (facets.length === 0) return null;
  const hasSelection = active.size > 0;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">{label}</span>
        {hasSelection && (
          <button
            type="button"
            onClick={onClearGroup}
            className="text-[10px] underline decoration-dotted text-[var(--text-muted)] hover:text-[var(--accent)]"
            title={`Clear all ${label.toLowerCase()} selections`}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {facets.map(([name, count]) => {
          const isActive = active.has(name);
          const isCrown = renderCrown?.(name) ?? false;
          // Major-only badge shows for non-crown leagues that still carry
          // at least one workbook ml=Y row. Crown overrides silver.
          const isMajor = !isCrown && (renderMajor?.(name) ?? false);
          // Visual state selection. Selected wins. Otherwise lit if upstream
          // filter is active. Otherwise idle.
          let chipClass: string;
          let chipStyle: React.CSSProperties | undefined;
          if (isActive) {
            chipClass = "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]";
            chipStyle = undefined;
          } else if (litWhenUnselected) {
            // Lit: slightly brighter border + full-strength text. Conveys
            // "this is in scope of your current filter."
            chipClass = "hover:border-[var(--accent)] hover:text-[var(--accent)]";
            chipStyle = { borderColor: "var(--accent)", color: "var(--text)", opacity: 0.85 };
          } else {
            // Idle: muted border + muted text.
            chipClass = "hover:border-[var(--accent)] hover:text-[var(--accent)]";
            chipStyle = { borderColor: "var(--border)", color: "var(--text-muted)" };
          }
          return (
            <button
              key={name}
              onClick={() => onToggle(name)}
              title={isCrown ? `${name}: top flight in its sport` : undefined}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${chipClass}`}
              style={chipStyle}
            >
              {renderDot && (
                <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: renderDot(name) }} />
              )}
              {isCrown && (
                <span aria-hidden className="text-[10px] leading-none" style={{ filter: "saturate(0.85)" }} title="Crown Jewel: top flight in its sport">
                  👑
                </span>
              )}
              {isMajor && (
                <span aria-hidden className="text-[10px] leading-none" style={{ filter: "saturate(0.4)" }} title="Major League">
                  🥈
                </span>
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
