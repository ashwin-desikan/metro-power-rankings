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
  federation?: string | null; // UEFA / COMNEBOL / CONCACAF / AFC / CAF / OFC / Unaffiliated for national-team rows
  fifa?: boolean | null;     // true if the country is a FIFA member, false otherwise; null for non-national-team rows
  active?: boolean | null;   // always true on emitted national-team markers (defunct rows are excluded entirely)
  workbook_level?: string | null; // Team List col J / FootballClub_Data col G (numeric tiers, College, Junior, etc.)
  season_note?: string | null; // Optional per-season annotation surfaced in the map tooltip — e.g. '2026 race cancelled' for F1 GPs that were dropped from the calendar.
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
  "Rugby Union":        "#881337", // rose-900 (deep wine — distinct from football green)
  "Rugby League":       "#e11d48", // rose-600 (bright wine — same family as Rugby Union, distinctly brighter)
  "T20 Cricket":        "#0e7490", // cyan-700
  "Test Cricket":       "#155e75", // cyan-800
  "Aussie Rules":       "#4338ca", // indigo-700
  "W Football":         "#be185d", // pink-700
  "W Basketball":       "#9d174d", // rose-800
  "Volleyball":         "#facc15", // yellow-400 (bright gold — distinct from football green)
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

// Gold Standard map + helper lives in lib/goldStandard.ts so both this
// explorer and the metro-page TeamCard can share it. Re-exported for any
// external consumer that may import from SportsExplorer.
export { GOLD_STANDARD_LEAGUES_BY_SPORT, isGoldStandardLeague } from "@/lib/goldStandard";
import { isGoldStandardLeague } from "@/lib/goldStandard";

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

// Union of the FBS Power 4 + Big East (the Basketball-only fifth high
// major). Used when the Power Conferences Special Filter toggles on to
// auto-select these chips in the League filter row.
const POWER_CONFERENCE_ALL = ["Big Ten", "Southeastern", "Big 12", "Atlantic Coast", "Big East"] as const;

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
type Preset = "gold" | "major" | "other" | "all";
const DEFAULT_PRESET: Preset = "major";

type FilterState = {
  sports: Set<string>;
  leagues: Set<string>;
  countries: Set<string>;
  federations: Set<string>;
  fifa: Set<string>;     // {'FIFA'} | {'Non-FIFA'} | {} | {both}
  active: Set<string>;   // {'Active'} | {} (Defunct excluded from data)
  levels: Set<string>;
};

// Federation chip order. Mirrors the six FIFA confederations + the
// Unaffiliated bucket (countries that play international football but
// don't belong to any of the six confederations: Falkland Islands,
// Greenland, Northern Cyprus, Monaco, Vatican City, etc). COMNEBOL
// spelling intentional — mirrors public/data/national-teams.tsv exactly.
const FEDERATION_ORDER = [
  "UEFA", "COMNEBOL", "CONCACAF", "AFC", "CAF", "OFC", "Unaffiliated",
] as const;

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
    fifa:        parseSetParam(searchParams.get("fifa")),
    active:      parseSetParam(searchParams.get("active")),
    levels:      parseSetParam(searchParams.get("level")),
  }));
  const [query, setQuery] = useState<string>(searchParams.get("q") || "");

  // Preset (mutually exclusive). Default: major.
  const [preset, setPreset] = useState<Preset>(() => {
    const p = searchParams.get("preset");
    if (p === "gold" || p === "major" || p === "other" || p === "all") return p;
    return DEFAULT_PRESET;
  });

  // Special Filter additive: layers Power Conferences college markers (Big
  // Ten, SEC, Big 12, ACC football + Big East-inclusive Big 5 hoops) on top
  // of whatever preset is selected. Default OFF, opt-in via Special Filters
  // row when American Football or Basketball is selected.
  const [addPower, setAddPower] = useState<boolean>(
    searchParams.get("power") === "1",
  );

  // Special Filter additive: layers the 250 International Teams (national
  // football teams) on top of whatever preset is selected. Default OFF,
  // opt-in via Special Filters row when Football is selected.
  const [addInternational, setAddInternational] = useState<boolean>(
    searchParams.get("intl") === "1",
  );

  // Push filter changes to URL (replace, not push, to keep history clean)
  useEffect(() => {
    const params = new URLSearchParams();
    const s = stringifySet(filters.sports);
    const l = stringifySet(filters.leagues);
    const c = stringifySet(filters.countries);
    const fed = stringifySet(filters.federations);
    const fifa = stringifySet(filters.fifa);
    const act = stringifySet(filters.active);
    const lev = stringifySet(filters.levels);
    if (s) params.set("sport", s);
    if (l) params.set("league", l);
    if (c) params.set("country", c);
    if (fed) params.set("fed", fed);
    if (fifa) params.set("fifa", fifa);
    if (act) params.set("active", act);
    if (lev) params.set("level", lev);
    if (query.trim()) params.set("q", query.trim());
    if (preset !== DEFAULT_PRESET) params.set("preset", preset);
    if (addPower) params.set("power", "1");
    if (addInternational) params.set("intl", "1");
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
      // Special Filter additives: opt-in toggles in the Special Filters row
      // that override the preset gate for specific subsets. Power
      // Conferences brings in Big Ten / SEC / Big 12 / ACC football and
      // Big East-inclusive Big 5 basketball; International Teams brings
      // in the 250 national football teams.
      if (addPower && isPowerConferences(t)) return true;
      if (addInternational && t.league === "International Teams") return true;
      switch (preset) {
        case "gold": return t.level === "Major" && isGoldStandardLeague(t.sport, t.league);
        case "major": return t.level === "Major";
        case "other": return t.level === "Other";
        case "all":   return true;
      }
    };
  }, [preset, addPower, addInternational]);

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
  //   tier 0 = Gold Standard (apex of sport)
  //   tier 1 = Major League (workbook ml=Y or Euroleague, non-crown)
  //   tier 2 = Other (college, minor, junior, lower-flight football)
  // goldStandardLeagueFlags and majorLeagueFlags are surfaced separately so the
  // FilterRow's renderCrown / renderMajor helpers know which chips to badge.
  const leagueFacetData = useMemo(() => {
    const counts = new Map<string, number>();
    const crown = new Set<string>();
    const major = new Set<string>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      // International Teams renders via the Special Filters row, not as a
      // regular League chip.
      if (t.league === "International Teams") continue;
      counts.set(t.league, (counts.get(t.league) || 0) + 1);
      if (isGoldStandardLeague(t.sport, t.league)) crown.add(t.league);
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
  const goldStandardLeagueFlags = leagueFacetData.crown;
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

  // FIFA facets — appears when International Teams is on. Two-state
  // (FIFA / Non-FIFA) so users can scope to recognized vs unrecognized
  // confederation entries (Falkland Islands, Northern Cyprus, etc.).
  const fifaFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (t.fifa === undefined || t.fifa === null) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      if (filters.federations.size > 0 && (!t.federation || !filters.federations.has(t.federation))) continue;
      const k = t.fifa ? "FIFA" : "Non-FIFA";
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return (["FIFA", "Non-FIFA"] as const)
      .filter((k) => counts.has(k))
      .map((k) => [k, counts.get(k)!] as [string, number]);
  }, [teams, presetIncludes, filters.sports, filters.leagues, filters.countries, filters.federations]);

  // Active facets — informational chip row alongside FIFA. Defunct rows
  // are excluded from the data emit, so this resolves to a single 'Active'
  // chip showing the surviving count.
  const activeFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (t.active === undefined || t.active === null) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      if (filters.federations.size > 0 && (!t.federation || !filters.federations.has(t.federation))) continue;
      if (filters.fifa.size > 0) {
        const fifaLabel = t.fifa === true ? "FIFA" : t.fifa === false ? "Non-FIFA" : null;
        if (!fifaLabel || !filters.fifa.has(fifaLabel)) continue;
      }
      const k = t.active ? "Active" : "Defunct";
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return (["Active", "Defunct"] as const)
      .filter((k) => counts.has(k))
      .map((k) => [k, counts.get(k)!] as [string, number]);
  }, [teams, presetIncludes, filters.sports, filters.leagues, filters.countries, filters.federations, filters.fifa]);

  // Level facets — workbook Level column (Team List col J / FootballClub_Data
  // col G). Heterogeneous across sports: numeric divisions ('1', '2', '3'),
  // college ('College'), and named tiers ('Junior', 'Independent', 'NASCAR',
  // baseball minor letters). Only renders when 2+ values survive upstream.
  // Sort: numeric ascending first, then alphabetical.
  const levelFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teams) {
      if (!presetIncludes(t)) continue;
      if (!t.workbook_level) continue;
      if (filters.sports.size > 0 && !filters.sports.has(t.sport)) continue;
      if (filters.leagues.size > 0 && !filters.leagues.has(t.league)) continue;
      if (filters.countries.size > 0 && !filters.countries.has(t.country)) continue;
      if (filters.federations.size > 0 && (!t.federation || !filters.federations.has(t.federation))) continue;
      counts.set(t.workbook_level, (counts.get(t.workbook_level) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => {
      const an = /^\d+$/.test(a[0]) ? parseInt(a[0], 10) : null;
      const bn = /^\d+$/.test(b[0]) ? parseInt(b[0], 10) : null;
      if (an !== null && bn !== null) return an - bn;
      if (an !== null) return -1;
      if (bn !== null) return 1;
      return a[0].localeCompare(b[0]);
    });
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
      if (filters.fifa.size > 0) {
        const fifaLabel = t.fifa === true ? "FIFA" : t.fifa === false ? "Non-FIFA" : null;
        if (!fifaLabel || !filters.fifa.has(fifaLabel)) return false;
      }
      if (filters.active.size > 0) {
        // 'Active' on emitted national-team markers is always true (defunct
        // are excluded); the chip still acts as an explicit narrow scope.
        if (t.active !== true || !filters.active.has("Active")) return false;
      }
      if (filters.levels.size > 0 && (!t.workbook_level || !filters.levels.has(t.workbook_level))) return false;
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

  // Power Conferences Special Filter: toggling on AUTO-SELECTS the 4/5
  // conference chips in filters.leagues (so they highlight in the League
  // row AND narrow the visible set to those conferences). Toggling off
  // removes them. The union covers both AF and Basketball; Big East has
  // no FBS rows so the AF view will only ever surface 4 of the 5.
  function toggleAddPower() {
    setAddPower((prev) => {
      const next = !prev;
      setFilters((prevF) => {
        const leagues = new Set(prevF.leagues);
        POWER_CONFERENCE_ALL.forEach((l) => {
          if (next) leagues.add(l);
          else leagues.delete(l);
        });
        return { ...prevF, leagues };
      });
      return next;
    });
  }

  // International Teams Special Filter: toggling on adds 'International
  // Teams' to filters.leagues so the visible set narrows to just the
  // national teams. The League FilterRow is hidden when this is on (the
  // Federation / FIFA / Active sub-filters are the only meaningful
  // narrowers left). When toggling off, also clear any Federation / FIFA
  // / Active selections so they do not silently filter the global set.
  function toggleAddInternational() {
    setAddInternational((prev) => {
      const next = !prev;
      setFilters((prevF) => {
        const leagues = new Set(prevF.leagues);
        if (next) {
          leagues.add("International Teams");
          return { ...prevF, leagues };
        }
        leagues.delete("International Teams");
        return {
          ...prevF,
          leagues,
          federations: new Set<string>(),
          fifa: new Set<string>(),
          active: new Set<string>(),
        };
      });
      return next;
    });
  }

  // Preset switch: cleanup Special Filter state when transitioning to
  // Gold or Major (where the chips are hidden). Without this, residual
  // Special-Filter-driven entries in filters.leagues would constrain the
  // top-flight view to a near-empty map.
  function handlePresetChange(newPreset: Preset) {
    if (newPreset === "gold" || newPreset === "major") {
      if (addPower) toggleAddPower();
      if (addInternational) toggleAddInternational();
    }
    setPreset(newPreset);
  }
  function clearAll() {
    setFilters({ sports: new Set(), leagues: new Set(), countries: new Set(), federations: new Set(), fifa: new Set(), active: new Set(), levels: new Set() });
    setQuery("");
    setPreset(DEFAULT_PRESET);
    setAddPower(false);
    setAddInternational(false);
  }

  // ---- Preset chip counts (raw, not preset-gated) ----
  const goldStandardCount = useMemo(
    () => teams.filter((t) => t.level === "Major" && isGoldStandardLeague(t.sport, t.league)).length,
    [teams],
  );
  const majorCount = useMemo(() => teams.filter((t) => t.level === "Major").length, [teams]);
  const otherCount = useMemo(() => teams.filter((t) => t.level === "Other").length, [teams]);
  const allCount = teams.length;
  const powerCount = useMemo(() => teams.filter(isPowerConferences).length, [teams]);
  const internationalCount = useMemo(
    () => teams.filter((t) => t.league === "International Teams").length,
    [teams],
  );

  // Special Filters row visibility — sport-conditional. Power Conferences
  // is meaningful for American Football and Basketball. International
  // Teams is meaningful for Football. Each chip appears only when its
  // sport is in the current sport filter (or, when no sport is selected,
  // both chips stay hidden because Special Filters by spec are opt-in
  // surfaces revealed by sport selection).
  const sportsActive = filters.sports;
  // Special Filters only surface under Other / All presets. Under Gold / Major
  // the visible scope is top-flight only, and the Special Filter subsets
  // (Power Conferences college, International Teams national teams) sit
  // outside that scope, so the chips would be meaningless.
  const presetAllowsSpecial = preset === "other" || preset === "all";
  const showPowerSpecial = presetAllowsSpecial &&
    (sportsActive.has("American Football") || sportsActive.has("Basketball"));
  const showInternationalSpecial = presetAllowsSpecial && sportsActive.has("Football");

  const hasFilters =
    filters.sports.size + filters.leagues.size + filters.countries.size + filters.federations.size + filters.fifa.size + filters.active.size + filters.levels.size > 0 ||
    query.trim().length > 0 ||
    preset !== DEFAULT_PRESET ||
    addPower ||
    addInternational;

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

      {/* Map. Mobile gets a viewport-height ceiling so the filter chips
          stay on screen; tablets and up keep the original fixed 540px. */}
      <div className="rounded-lg overflow-hidden border h-[60vh] sm:h-[540px]">
        {visible.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm text-[var(--text)] mb-2">
                No teams match these filters.
              </p>
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="text-xs underline decoration-dotted text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <SportsMapInner markers={visible} />
        )}
      </div>

      {/* Tier definitions — expandable native disclosure so the page
          stays compact on first paint but the semantics of each Preset
          chip are one click away. Counts come from the same useMemos
          that drive the chips, so they stay in sync as the data evolves. */}
      <details className="group rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-2">
          <span className="text-[10px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
          What do these tiers mean?
        </summary>
        <div className="grid sm:grid-cols-3 gap-4 px-4 pb-4 pt-1 text-[12px] leading-relaxed">
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              <span aria-hidden>🥇</span> Gold Standard{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({goldStandardCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              The apex top-flight in each sport. Football's top-five European leagues (Premier League / La Liga / Serie A / Bundesliga / Ligue 1) plus WSL and NWSL on the women's side. NFL, MLB, NBA, NHL, Top 14, Superlega, NRL, AFL, Handball-Bundesliga, WNBA, IPL elsewhere. The leagues a global sports fan names first.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              <span aria-hidden>🥈</span> Major League{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({majorCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Every workbook-flagged Major League team. Includes the Gold Standard as a strict subset plus other top flights: KHL hockey, CBA basketball, EuroLeague, NPB baseball, CFL, Brasileirão, Argentine Primera, Liga F, and country-level top-flight football outside the European top five.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              Other Teams{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({otherCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Everything else with a place on the map: US college (FBS, NCAA Division I, NCAA W, FCS, College Hockey), Minor League Baseball, junior hockey, lower-flight football across every footballing nation, second-tier international competitions. Plus 250 national football teams via the Special Filter when Sport=Football is selected.
            </p>
          </div>
        </div>
      </details>

      {/* Preset row — mutually exclusive. Gold Standard = top-flight per sport;
          Major League = workbook 'Major League' = Y; Other = everything else
          (college, minor, junior, lower-flight football); All = both combined. */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Preset</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <PresetChip
            label="Gold Standard"
            count={goldStandardCount}
            active={preset === "gold"}
            onClick={() => handlePresetChange("gold")}
            crown
            title="The world's top-flight competition in each sport: NBA, NFL, NHL, MLB, CFL, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Top 14, WSL, NWSL, Superlega, NRL, AFL, Handball-Bundesliga, WNBA, IPL."
          />
          <PresetChip
            label="Major League"
            count={majorCount}
            active={preset === "major"}
            onClick={() => handlePresetChange("major")}
            silver
            title="Every workbook Major League top-flight team across all sports. Includes the Gold Standard as a strict subset."
          />
          <PresetChip
            label="Other Teams"
            count={otherCount}
            active={preset === "other"}
            onClick={() => handlePresetChange("other")}
            title="Every other team: college (FBS, NCAA D-I, FCS, College Hockey, NCAA W), Minor League, Junior, lower-flight football, second-tier international leagues."
          />
          <PresetChip
            label="All Teams"
            count={allCount}
            active={preset === "all"}
            onClick={() => handlePresetChange("all")}
            title="Everything on file: Major League + Other combined."
          />
        </div>
      </div>

      {/* Sport filter — primary discriminator. */}
      <FilterRow
        label="Sport"
        facets={sportFacets}
        active={filters.sports}
        onToggle={(v) => toggle("sports", v)}
        onClearGroup={() => clearGroup("sports")}
        litWhenUnselected={sportRowLit}
        renderDot={(name) => SPORT_COLORS[name] || DEFAULT_SPORT_COLOR}
      />

      {/* Special Filters — sport-conditional opt-in additives. Hidden
          entirely unless the user has selected a sport that exposes a
          special filter. Power Conferences appears for American Football /
          Basketball; International Teams appears for Football. */}
      {(showPowerSpecial || showInternationalSpecial) && (
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-1.5">Special Filters</div>
          <div className="flex flex-wrap gap-1.5">
            {showPowerSpecial && (
              <SpecialChip
                label="+ NCAA Power Conferences"
                count={powerCount}
                active={addPower}
                onClick={toggleAddPower}
                title={addPower
                  ? "On: Big Ten / SEC / Big 12 / ACC football and Big East-inclusive Big 5 basketball are layered on top of the preset. Click to remove."
                  : "Off: click to layer NCAA Power Conferences (Big Ten / SEC / Big 12 / ACC football + Big East-inclusive Big 5 basketball) on top of the preset."}
              />
            )}
            {showInternationalSpecial && (
              <SpecialChip
                label="+ International Teams"
                count={internationalCount}
                active={addInternational}
                onClick={toggleAddInternational}
                title={addInternational
                  ? "On: the 250 national football teams are layered on top of the preset, with the Federation sub-filter below. Click to remove."
                  : "Off: click to layer the 250 national football teams on top of the preset."}
              />
            )}
          </div>
        </div>
      )}

      {/* League filter — appears once Sport or Country is selected.
          Crown leagues prefixed with 👑, non-crown Major League leagues
          with 🥈. Sort tier: crown > major > other, then count desc.
          International Teams is excluded from this row (it lives in
          Special Filters above). */}
      {(filters.sports.size > 0 || filters.countries.size > 0) && leagueFacets.length > 0 && !addInternational && (
        <FilterRow
          label="League"
          facets={leagueFacets}
          active={filters.leagues}
          onToggle={(v) => toggle("leagues", v)}
          onClearGroup={() => clearGroup("leagues")}
          litWhenUnselected={leagueRowLit}
          renderCrown={(name) => goldStandardLeagueFlags.has(name)}
          renderMajor={(name) => majorLeagueFlags.has(name)}
        />
      )}

      {/* Country filter — now placed after League per the discriminator
          hierarchy (Sport > League > Country). Cross-scoped to whatever
          the preset + Special Filters + Sport + League leave behind. */}
      <FilterRow
        label="Country"
        facets={countryFacets.slice(0, 30)}
        active={filters.countries}
        onToggle={(v) => toggle("countries", v)}
        onClearGroup={() => clearGroup("countries")}
        litWhenUnselected={countryRowLit}
      />

      {/* Federation filter — only when the International Teams Special
          Filter is on. Maps to FIFA confederations using workbook
          continent (Israel/Kazakhstan -> UEFA, Australia -> AFC, Suriname
          -> CONCACAF). */}
      {addInternational && federationFacets.length > 0 && (
        <FilterRow
          label="Federation"
          facets={federationFacets}
          active={filters.federations}
          onToggle={(v) => toggle("federations", v)}
          onClearGroup={() => clearGroup("federations")}
          litWhenUnselected={federationRowLit}
        />
      )}

      {/* FIFA filter — appears when International Teams is on. Splits
          national teams into FIFA members (211 today) and Non-FIFA (38). */}
      {addInternational && fifaFacets.length > 0 && (
        <FilterRow
          label="FIFA"
          facets={fifaFacets}
          active={filters.fifa}
          onToggle={(v) => toggle("fifa", v)}
          onClearGroup={() => clearGroup("fifa")}
          litWhenUnselected={federationRowLit}
        />
      )}

      {/* Active filter — informational chip row. Defunct teams are
          excluded from data entirely so this is currently a single-chip
          row showing the active count. */}
      {addInternational && activeFacets.length > 0 && (
        <FilterRow
          label="Active"
          facets={activeFacets}
          active={filters.active}
          onToggle={(v) => toggle("active", v)}
          onClearGroup={() => clearGroup("active")}
          litWhenUnselected={federationRowLit}
        />
      )}

      {/* Level filter — reflects the workbook Level column (Team List col J,
          FootballClub_Data col G). Values include '1' / '2' / '3' (tiered
          numeric divisions), 'College', 'Junior', 'Independent', 'NASCAR',
          'F1', and the baseball minor-league letters. Only renders when 2+
          values survive the upstream filters. */}
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

// SpecialChip — additive opt-in toggle used inside the Special Filters row.
// Visually parallel to PresetChip; same border / accent treatment.
function SpecialChip({
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

// PresetChip — used for the four mutually exclusive preset toggles.
// Selected uses full accent background; unselected uses border-only.
function PresetChip({
  label,
  count,
  active,
  onClick,
  crown,
  silver,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  crown?: boolean;  // 🥇 Gold Standard
  silver?: boolean; // 🥈 Major League (Gold Standard is a strict subset, so this is for the wider Major League preset)
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
      {crown && <span aria-hidden className="text-[10px] leading-none">🥇</span>}
      {silver && <span aria-hidden className="text-[10px] leading-none">🥈</span>}
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
        {/* Clear link is always rendered while the row is visible. When the
            group has no selections the button is dimmed and a no-op, but
            it stays visible so users can find it consistently across all
            filter rows. */}
        <button
          type="button"
          onClick={onClearGroup}
          disabled={!hasSelection}
          className={`text-[10px] underline decoration-dotted ${
            hasSelection
              ? "text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
              : "text-[var(--text-dim)] opacity-50 cursor-not-allowed"
          }`}
          title={hasSelection ? `Clear all ${label.toLowerCase()} selections` : `No ${label.toLowerCase()} selected`}
        >
          Clear
        </button>
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
                <span aria-hidden className="text-[10px] leading-none" title="Gold Standard: top flight in its sport">
                  🥇
                </span>
              )}
              {isMajor && (
                <span
                  aria-hidden
                  className="text-[10px] leading-none"
                  title="Major League (non-crown top flight in its sport)"
                >
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
