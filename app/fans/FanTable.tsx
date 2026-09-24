"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SortableBoard, { type BoardCol, type BoardRow } from "@/app/_shared/SortableBoard";
import { Sparkline } from "@/app/_shared/Sparkline";
import { DataBar } from "@/app/_shared/DataBar";
import {
  leagueIcon,
  FAN_INDEX_SPORTS,
  FAN_INDEX_SPORT_LEAGUES,
  fanIndexSportIcon,
  type FanIndexSport,
} from "@/lib/sportLabels";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const SPIKE_THRESHOLD = 2.5;
const FOOTBALL_LEAGUES = [
  "Premier League", "Championship", "La Liga", "Bundesliga", "Serie A",
  "Ligue 1", "Primeira Liga", "Eredivisie", "Scottish Premiership", "Süper Lig",
  "MLS", "Liga MX", "Brasileirão", "Liga Profesional",
];
const WOMENS_FOOTBALL_LEAGUES = ["NWSL", "WSL"];
const MAJOR_AMERICAN_GROUPS = ["NFL", "NBA", "MLB", "NHL", "College football", "College basketball"];
const WOMENS_SPORTS_GROUPS = ["WNBA", "Women's football"];
const WORLD_GROUPS = [
  "F1", "EuroLeague", "AFL", "NRL", "IPL", "NPB", "CFL",
  "Top 14", "Handball-Bundesliga", "SuperLega",
];
const ALL_FOOTBALL = "All football";
const ALL_GROUPS = "All groups";
const ALL_LEAGUES = "All leagues";
const BUILD_YOUR_OWN = "Build your own";

// Top-level tabs, and the "category" value + group list each one scopes to
// (except All and Football, which are special-cased: All shows everything,
// Football is its own group with league chips instead of group chips).
const TOP_TABS = ["All", "Football", "Major American sports", "Women's sports", "World", BUILD_YOUR_OWN] as const;
type TopTab = (typeof TOP_TABS)[number];

// --- Build your own -------------------------------------------------
//
// A slug per selectable group and, for Football and Women's football, per
// league within it, so a selection can round-trip through the URL query
// (?build=nfl,premier-league,wnba) for a signed-in user to share. Group
// slugs and league slugs never collide, so one flat Set<string> of tokens
// covers both "the whole group" and "just this league within it".
const BUILD_GROUP_SLUG: Record<string, string> = {
  Football: "football", NFL: "nfl", NBA: "nba", MLB: "mlb", NHL: "nhl",
  "College football": "college-football", "College basketball": "college-basketball",
  WNBA: "wnba", "Women's football": "womens-football",
  F1: "f1", EuroLeague: "euroleague", AFL: "afl", NRL: "nrl", IPL: "ipl",
  NPB: "npb", CFL: "cfl", "Top 14": "top-14",
  "Handball-Bundesliga": "handball-bundesliga", SuperLega: "superlega",
};
const BUILD_LEAGUE_SLUG: Record<string, string> = {
  "Premier League": "premier-league", Championship: "championship", "La Liga": "la-liga",
  Bundesliga: "bundesliga", "Serie A": "serie-a", "Ligue 1": "ligue-1",
  "Primeira Liga": "primeira-liga", Eredivisie: "eredivisie",
  "Scottish Premiership": "scottish-premiership", "Süper Lig": "super-lig",
  MLS: "mls", "Liga MX": "liga-mx", "Brasileirão": "brasileirao", "Liga Profesional": "liga-profesional",
  NWSL: "nwsl", WSL: "wsl",
};
// The two Women's football leagues plus WNBA are the only fan-index
// leagues that are women-only, for the Build-your-own Men's / Women's
// toggle (2026-09-24 sport-chip rework operates at LEAGUE granularity
// throughout, not group). Everything else (including mixed-field sports
// like F1) stays visible under both, since the toggle is a scoping
// convenience, not a claim that every other league is men-only.
const WOMENS_ONLY_LEAGUES = new Set(["WNBA", "NWSL", "WSL"]);

// One token per LEAGUE, for every one of the dataset's 33 leagues, reusing
// the EXACT SAME token strings the site has always used (2026-09-24 sport-
// chip rework: previously only Football's and Women's football's own
// leagues had a per-league token; every other group's token WAS ALREADY a
// league token in disguise, since group === league for all of them -- NFL,
// NBA, MLB, ... are each a group of exactly one league sharing its name).
// This is what makes a sport chip's "select every league of this sport"
// meaningful for BOTH kinds of sport, and what keeps every existing
// ?build=... link (group tokens included) resolving to exactly the same
// teams as before: the filter below still checks BUILD_GROUP_SLUG[t.group]
// first, unchanged.
const SINGLE_LEAGUE_GROUP_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(BUILD_GROUP_SLUG).filter(([g]) => g !== "Football" && g !== "Women's football"),
);
const LEAGUE_KEY_BY_LEAGUE: Record<string, string> = { ...SINGLE_LEAGUE_GROUP_SLUG, ...BUILD_LEAGUE_SLUG };

// URL-only slug per sport, for the shareable ?sports=... mirror of which
// sport chips are fully selected (see the URL-sync effect below). Not the
// source of truth for filtering -- ?build=... (league tokens) is -- so a
// typo or an unknown slug here only ever fails to restore a chip's visual
// "fully selected" state, never drops a team from the table.
const SPORT_SLUG: Record<FanIndexSport, string> = {
  Football: "football", Gridiron: "gridiron", Basketball: "basketball",
  Baseball: "baseball", Hockey: "hockey", Rugby: "rugby",
  "Aussie rules": "aussie-rules", Cricket: "cricket", Motorsport: "motorsport",
  Handball: "handball", Volleyball: "volleyball",
};
const SPORT_BY_SLUG: Record<string, FanIndexSport> = Object.fromEntries(
  FAN_INDEX_SPORTS.map((s) => [SPORT_SLUG[s], s]),
);

function leagueTokensForSport(sport: FanIndexSport): string[] {
  return FAN_INDEX_SPORT_LEAGUES[sport].map((lg) => LEAGUE_KEY_BY_LEAGUE[lg]).filter((t): t is string => !!t);
}

function parseBuildQuery(): { selection: Set<string>; gender: "all" | "men" | "women" } {
  if (typeof window === "undefined") return { selection: new Set(), gender: "all" };
  const params = new URLSearchParams(window.location.search);
  const build = params.get("build");
  const sportsParam = params.get("sports");
  const gender = params.get("gender");
  const selection = new Set(build ? build.split(",").filter(Boolean) : []);
  // ?sports=... is a convenience on top of ?build=...: each listed sport
  // adds every one of its league tokens, so an old ?build=-only link is
  // unaffected and a ?sports=-only link still resolves to real teams.
  if (sportsParam) {
    for (const slug of sportsParam.split(",").filter(Boolean)) {
      const sport = SPORT_BY_SLUG[slug];
      if (!sport) continue;
      for (const token of leagueTokensForSport(sport)) selection.add(token);
    }
  }
  return {
    selection,
    gender: gender === "men" || gender === "women" ? gender : "all",
  };
}

const CATEGORY_GROUPS: Partial<Record<TopTab, string[]>> = {
  "Major American sports": MAJOR_AMERICAN_GROUPS,
  "Women's sports": WOMENS_SPORTS_GROUPS,
  World: WORLD_GROUPS,
};

export type FanTableTeam = {
  team: string;
  displayName: string;
  href: string | null;
  group: string;
  league: string;
  category: string;
  wikiBaseline12m: number;
  fanIndexRaw: number;
  scoreInGroup: number;
  rankInGroup: number;
  rankInLeague: number;
  globalScore: number;
  globalRank: number;
  inFlux: string | null;
  inclusionRule: string | null;
  globalReachPct: number | null;
  spikeRatio: number;
  monthly: (number | null)[];
  valueM: number | null;
  valSource: string | null;
  valYear: number | null;
  valMethod: string | null;
  valUnit: string | null;
  residualPct: number | null;
  valueVsAttention: number | null;
  residualEligible: boolean;
};

function formatValueM(m: number): string {
  if (m >= 1000) {
    const b = m / 1000;
    const s = b.toFixed(2).replace(/\.?0+$/, "");
    return `$${s}B`;
  }
  return `$${Math.round(m)}M`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

// The JSON's in_flux carries a short label plus a parenthetical detail, e.g.
// "relocated (Oakland Athletics played 2025 season in Sacramento pending Las
// Vegas move)". Bucket it into the three marker categories the page shows,
// keeping the full string as the tooltip.
function inFluxLabel(raw: string): string {
  const s = raw.toLowerCase();
  const labels: string[] = [];
  if (s.startsWith("new") || s.includes("/new") || s.includes("new/")) labels.push("New franchise");
  if (s.includes("relocat")) labels.push("Relocated");
  if (s.includes("renam")) labels.push("Renamed");
  return labels.length ? labels.join(" / ") : "Recent change";
}

function TeamCell({ t }: { t: FanTableTeam }) {
  const inner = (
    <>
      <span className="font-medium">{t.displayName}</span>
      {t.spikeRatio >= SPIKE_THRESHOLD ? (
        <span
          className="ml-1.5 inline-block text-[var(--seq-4)]"
          title={`Event-driven spike: this team's busiest month drew ${t.spikeRatio.toFixed(1)}x its typical month.`}
          aria-label="Event-driven spike"
        >
          ⚡
        </span>
      ) : null}
      {t.inFlux ? (
        <span
          className="ml-1 inline-block text-[var(--accent)]"
          title={`${inFluxLabel(t.inFlux)}: ${t.inFlux}. Weighted at 0.5x on attention, since look-up curiosity about the change inflates raw traffic.`}
          aria-label={inFluxLabel(t.inFlux)}
        >
          ●
        </span>
      ) : null}
      {t.inclusionRule ? (
        <span
          className="ml-1 inline-block text-[var(--text-dim)]"
          title={`Added by inclusion rule: ${t.inclusionRule}`}
          aria-label="Added by inclusion rule"
        >
          ‡
        </span>
      ) : null}
    </>
  );
  return t.href ? (
    <Link href={t.href} className="hover:underline">{inner}</Link>
  ) : (
    <span>{inner}</span>
  );
}

export default function FanTable({ teams }: { teams: FanTableTeam[] }) {
  const [topTab, setTopTab] = useState<TopTab>("All");
  const [footballLeague, setFootballLeague] = useState<string>(ALL_FOOTBALL);
  const [catGroup, setCatGroup] = useState<string | null>(null);
  const [wflLeague, setWflLeague] = useState<string | null>(null);
  const [buildSelection, setBuildSelection] = useState<Set<string>>(() => new Set());
  const [buildGender, setBuildGender] = useState<"all" | "men" | "women">("all");
  const [refineOpen, setRefineOpen] = useState(false);
  const buildInitFromUrl = useRef(false);

  // One-time read of ?build=...&gender=... on mount, so a shared link opens
  // straight into the matching comparison. Client-only (window), so this
  // runs after hydration rather than during any server render.
  useEffect(() => {
    const { selection, gender } = parseBuildQuery();
    if (selection.size > 0 || gender !== "all") {
      setBuildSelection(selection);
      setBuildGender(gender);
      setTopTab(BUILD_YOUR_OWN);
    }
    buildInitFromUrl.current = true;
  }, []);

  // Keep the URL in sync while on the Build your own tab, so the current
  // comparison is always at a shareable link. Skipped until the one-time
  // read above has run, so it never clobbers an incoming ?build= link.
  useEffect(() => {
    if (!buildInitFromUrl.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (topTab === BUILD_YOUR_OWN && buildSelection.size > 0) {
      url.searchParams.set("build", Array.from(buildSelection).join(","));
    } else {
      url.searchParams.delete("build");
    }
    if (topTab === BUILD_YOUR_OWN && buildGender !== "all") {
      url.searchParams.set("gender", buildGender);
    } else {
      url.searchParams.delete("gender");
    }
    // ?sports=...: a derived, shareable mirror of which sport chips are
    // FULLY selected (every one of that sport's leagues is in
    // buildSelection). Purely a convenience for restoring the chip's
    // filled-in visual state and for a shorter link when a whole sport is
    // meant -- buildSelection (?build=...) is what actually drives the
    // table either way, so this can never itself drop or add a team.
    const fullySelectedSports = FAN_INDEX_SPORTS.filter((sport) => {
      const tokens = leagueTokensForSport(sport);
      return tokens.length > 0 && tokens.every((t) => buildSelection.has(t));
    });
    if (topTab === BUILD_YOUR_OWN && fullySelectedSports.length > 0) {
      url.searchParams.set("sports", fullySelectedSports.map((s) => SPORT_SLUG[s]).join(","));
    } else {
      url.searchParams.delete("sports");
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [topTab, buildSelection, buildGender]);

  function selectTopTab(tab: TopTab) {
    setTopTab(tab);
    setFootballLeague(ALL_FOOTBALL);
    setCatGroup(null);
    setWflLeague(null);
  }

  function toggleBuildToken(token: string) {
    setBuildSelection((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function clearBuild() {
    setBuildSelection(new Set());
    setBuildGender("all");
  }

  // Sport chip click: "selects every league of that sport; clicking again
  // clears them" (coordinator's spec). A PARTIAL sport (some but not all of
  // its leagues already selected, e.g. from the refine panel) also fills
  // in to fully selected on click, same as a sport with nothing selected --
  // only a chip that is already FULLY selected clears on click. Takes the
  // PRESENT (data-visible, gender-filtered) tokens for that sport, not
  // every token the sport could ever have, so a men's-only view of
  // "Football" never silently adds NWSL/WSL to the selection.
  function toggleSport(presentTokens: string[]) {
    if (presentTokens.length === 0) return;
    const allSelected = presentTokens.every((t) => buildSelection.has(t));
    setBuildSelection((prev) => {
      const next = new Set(prev);
      for (const t of presentTokens) {
        if (allSelected) next.delete(t);
        else next.add(t);
      }
      return next;
    });
  }

  function sportSelectionState(sport: FanIndexSport, presentTokens: string[]): "all" | "partial" | "none" {
    if (presentTokens.length === 0) return "none";
    const selectedCount = presentTokens.filter((t) => buildSelection.has(t)).length;
    if (selectedCount === 0) return "none";
    return selectedCount === presentTokens.length ? "all" : "partial";
  }

  const isAllTab = topTab === "All";
  const isFootballTab = topTab === "Football";
  const isBuildTab = topTab === BUILD_YOUR_OWN;
  const categoryGroups = CATEGORY_GROUPS[topTab] ?? null; // non-null for MAS / Women's sports / World
  const isWomensFootball = catGroup === "Women's football";

  const footballLeaguesPresent = useMemo(
    () => FOOTBALL_LEAGUES.filter((lg) => teams.some((t) => t.group === "Football" && t.league === lg)),
    [teams],
  );
  const catGroupsPresent = useMemo(
    () => (categoryGroups ?? []).filter((g) => teams.some((t) => t.category === topTab && t.group === g)),
    [teams, categoryGroups, topTab],
  );
  const wflLeaguesPresent = useMemo(
    () => WOMENS_FOOTBALL_LEAGUES.filter((lg) => teams.some((t) => t.group === "Women's football" && t.league === lg)),
    [teams],
  );

  // Build-your-own, sport-chip rework (2026-09-24): for each sport, its
  // leagues that both (a) have at least one team in this dataset and (b)
  // pass the current Men's/Women's filter, plus the league tokens for
  // exactly those leagues. Recomputed on buildGender so a sport with no
  // leagues left under the current filter (e.g. Gridiron under "Women's")
  // disappears from the chip row entirely, same as every other present-
  // filtered chip list on this page.
  const sportLeaguesPresent = useMemo(() => {
    const leagueOk = (lg: string) => {
      if (buildGender === "men") return !WOMENS_ONLY_LEAGUES.has(lg);
      if (buildGender === "women") return WOMENS_ONLY_LEAGUES.has(lg);
      return true;
    };
    const map = new Map<FanIndexSport, { leagues: string[]; tokens: string[] }>();
    for (const sport of FAN_INDEX_SPORTS) {
      const leagues = FAN_INDEX_SPORT_LEAGUES[sport].filter(
        (lg) => leagueOk(lg) && teams.some((t) => t.league === lg),
      );
      const tokens = leagues.map((lg) => LEAGUE_KEY_BY_LEAGUE[lg]).filter((t): t is string => !!t);
      map.set(sport, { leagues, tokens });
    }
    return map;
  }, [teams, buildGender]);
  const sportsPresent = useMemo(
    () => FAN_INDEX_SPORTS.filter((sport) => (sportLeaguesPresent.get(sport)?.leagues.length ?? 0) > 0),
    [sportLeaguesPresent],
  );

  // "Scoped" = the view is narrowed to one group (a league or a single
  // sport), so the Attention score compares teams within that group rather
  // than across the whole index.
  const scoped = isFootballTab || (categoryGroups !== null && catGroup !== null);
  // Major American sports (NFL/NBA/MLB/NHL/College football/College
  // basketball) are one market and (overwhelmingly) one language, so raw
  // Wikipedia attention is directly comparable across all six groups with
  // no revenue scaling needed -- unlike the cross-sport score, which exists
  // specifically to make leagues of very different sizes comparable. This
  // applies to the whole tab, not just a single group chip within it: even
  // "all six at once" is a fair raw comparison here in a way it is not for
  // e.g. NFL vs. IPL.
  const isMajorAmerican = topTab === "Major American sports";
  const showLeagueRank =
    (isFootballTab && footballLeague !== ALL_FOOTBALL) ||
    (isWomensFootball && wflLeague !== null);

  const filtered = useMemo(() => {
    if (isAllTab) return teams;
    if (isFootballTab) {
      let rows = teams.filter((t) => t.group === "Football");
      if (footballLeague !== ALL_FOOTBALL) rows = rows.filter((t) => t.league === footballLeague);
      return rows;
    }
    if (isBuildTab) {
      if (buildSelection.size === 0) return [];
      return teams.filter((t) => {
        const groupToken = BUILD_GROUP_SLUG[t.group];
        if (groupToken && buildSelection.has(groupToken)) return true;
        const leagueToken = BUILD_LEAGUE_SLUG[t.league];
        return !!leagueToken && buildSelection.has(leagueToken);
      });
    }
    if (categoryGroups !== null) {
      let rows = teams.filter((t) => t.category === topTab);
      if (catGroup) {
        rows = rows.filter((t) => t.group === catGroup);
        if (catGroup === "Women's football" && wflLeague) rows = rows.filter((t) => t.league === wflLeague);
      }
      return rows;
    }
    return teams;
  }, [teams, isAllTab, isFootballTab, isBuildTab, buildSelection, footballLeague, categoryGroups, topTab, catGroup, wflLeague]);

  const cols: BoardCol[] = [
    { key: "team", label: "Team", sortable: true, className: "min-w-[10rem]" },
    scoped
      ? { key: "league", label: "League", sortable: true, demote: "md", short: "League" }
      : { key: "group", label: "Group / League", sortable: true, demote: "md", short: "Group" },
    ...(showLeagueRank
      ? [{ key: "leagueRank", label: "Lg #", right: true, sortable: true, demote: "sm", title: `Rank within ${isFootballTab ? footballLeague : wflLeague}` } as BoardCol]
      : []),
    {
      key: "score",
      label: isMajorAmerican ? "Attention (US)" : scoped ? "Attention" : "Cross-sport score",
      right: true,
      sortable: true,
      title: isMajorAmerican
        ? "Teams in one market compared on attention directly; the All view scales each league by its market size."
        : scoped
          ? "0 to 100, scaled to the top team in its group"
          : "0 to 100, revenue-scaled share of the single most-watched team across all sports",
    },
    { key: "baseline", label: "Baseline views", right: true, sortable: true, demote: "sm", title: "Median monthly all-language Wikipedia views x 12 (spike-dampened)" },
    { key: "trend", label: "12mo", right: false, sortable: false, demote: "md", className: "w-24" },
    { key: "value", label: "Valuation", right: true, sortable: true },
    { key: "vsAttention", label: "Valued vs attention", right: true, sortable: true, demote: "sm", title: "×1.8 means the team is valued at 1.8 times what is typical in its league for its level of attention. 1.0 is the league norm." },
  ];

  const rows: BoardRow[] = filtered.map((t) => {
    const icon = leagueIcon(t.league) || leagueIcon(t.group);
    // val_unit (2026-09-24): distinguishes a college row still carrying the
    // whole athletic department's figure ("athletic dept" badge) from one
    // with its own program-level value -- either a normal team-level value
    // (val_unit null, no badge from this check) or a derived program value
    // (val_method "derived", "program value" badge below). Was previously
    // (bug) checked as t.valMethod === "college", a value val_method never
    // actually takes, so the "athletic dept" badge never rendered.
    const methodBadge =
      t.valueM == null || !t.valMethod || t.valMethod === "published"
        ? (t.valUnit === "athletic department"
            ? <span className="ml-1 rounded border px-1 text-[9px] uppercase tracking-wide text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }} title="The whole athletic department, not one sport">athletic dept</span>
            : null)
        : t.valMethod === "transaction"
          ? <span className="ml-1 rounded border px-1 text-[9px] uppercase tracking-wide text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }} title="Implied by a recent stake sale">deal</span>
          : t.valUnit === "athletic department"
            ? <span className="ml-1 rounded border px-1 text-[9px] uppercase tracking-wide text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }} title="The whole athletic department, not one sport">athletic dept</span>
            : t.valMethod === "derived"
              ? <span className="ml-1 rounded border px-1 text-[9px] uppercase tracking-wide text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }} title="Program value: this sport's revenue share of the athletic department's valuation.">program value</span>
              : t.valMethod === "speculative"
                ? <span className="ml-1 text-[9px] italic text-[var(--text-dim)]" title="Estimate, not a reported valuation or a disclosed deal">est</span>
                : null;

    // Est badge (2026-09-24): same badge as the Valuation column's
    // methodBadge, repeated here so a reader scanning the "Valued vs
    // attention" column alone -- not cross-referencing Valuation -- can
    // still tell a speculative-sourced multiplier apart from a published
    // one, since v0.9 shows a multiplier for every valued team in a league
    // with enough valued teams (>= 3, any method), not only for leagues
    // whose fit cleared an R^2 bar.
    const vsAttentionEstBadge = t.valMethod === "speculative"
      ? <span className="ml-1 text-[9px] italic text-[var(--text-dim)]" title="Estimate, not a reported valuation or a disclosed deal">est</span>
      : null;
    // College basketball (2026-09-24, refined 2026-09-24 when program-level
    // values were added): a College basketball row whose value_m is still
    // the whole athletic department's figure (val_unit === "athletic
    // department") never gets a value_vs_attention from csv_to_json.py's
    // apply_value_vs_attention() (see that function's doc comment) -- the
    // value itself still shows, only the multiplier is withheld, with a
    // tooltip that says why instead of the generic "too few valued teams"
    // one. A College basketball row with its own program value (val_unit
    // null) is compared normally, so it falls through to the generic
    // message like any other league.
    const vsAttentionDashTitle =
      t.valueM == null
        ? undefined
        : t.league === "College basketball" && t.valUnit === "athletic department"
          ? "Value covers the whole athletic department, so it is not compared with basketball attention."
          : "Not shown: fewer than 3 valued teams in this league.";
    const vsAttentionCell = t.valueVsAttention == null
      ? <span className="text-[var(--text-dim)]" title={vsAttentionDashTitle}>—</span>
      : <span className="tabular-nums">&times;{t.valueVsAttention.toFixed(1)}{vsAttentionEstBadge}</span>;

    const score = isMajorAmerican ? t.fanIndexRaw : scoped ? t.scoreInGroup : t.globalScore;

    return {
      key: `${t.group}-${t.league}-${t.team}`,
      sort: {
        team: t.displayName,
        group: t.group === t.league ? t.group : `${t.group}, ${t.league}`,
        league: t.league,
        leagueRank: showLeagueRank ? -t.rankInLeague : null,
        score,
        baseline: t.wikiBaseline12m,
        value: t.valueM,
        vsAttention: t.valueVsAttention,
      },
      cells: [
        <TeamCell key="team" t={t} />,
        scoped
          ? <span key="league" className="text-[var(--text-muted)]">{icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}{t.league}</span>
          : <span key="group" className="text-[var(--text-muted)]">{icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}{t.group}{t.group !== t.league ? <> <span className="text-[var(--text-dim)]">{"·"}</span> {t.league}</> : null}</span>,
        ...(showLeagueRank ? [<DataBar key="leagueRank" v={t.rankInLeague} dp={0} />] : []),
        isMajorAmerican ? <DataBar key="score" v={score} dp={0} format={formatCompact} /> : <DataBar key="score" v={score} dp={1} />,
        <DataBar key="baseline" v={t.wikiBaseline12m} format={formatCompact} />,
        <Sparkline
          key="trend"
          values={t.monthly}
          label={`${t.displayName} monthly Wikipedia views, last 12 months`}
        />,
        t.valueM == null
          ? <span key="value" className="text-[var(--text-dim)]">—</span>
          : <span key="value" className="tabular-nums text-xs" title={t.valSource ? `${t.valSource}${t.valYear ? ` (${t.valYear})` : ""}` : undefined}>{formatValueM(t.valueM)}{methodBadge}</span>,
        <span key="vsAttention">{vsAttentionCell}</span>,
      ],
      mobile: {
        name: <TeamCell key="team" t={t} />,
        sub: <span>{icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}{scoped ? t.league : (t.group === t.league ? t.group : `${t.group} · ${t.league}`)}</span>,
        right: <span style={MONO}>{isMajorAmerican ? formatCompact(score) : score.toFixed(1)}</span>,
        rightSub: t.valueM != null ? formatValueM(t.valueM) : undefined,
      },
    };
  });

  return (
    <div>
      <div className="flex flex-wrap gap-x-1 gap-y-1 border-b mb-1" style={{ borderColor: "var(--border)" }}>
        {TOP_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => selectTopTab(tab)}
            className="px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              borderBottom: tab === topTab ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === topTab ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {isAllTab ? (
        <p className="text-xs text-[var(--text-dim)] mb-4">
          Across sports, each league's attention is scaled by the size of its market (the geometric mean of its Wikipedia attention and its annual revenue), then shared among its teams by their attention.
        </p>
      ) : null}

      {isFootballTab ? (
        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
          {[ALL_FOOTBALL, ...footballLeaguesPresent].map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setFootballLeague(lg)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: lg === footballLeague ? "var(--accent)" : "var(--border)",
                color: lg === footballLeague ? "var(--text)" : "var(--text-muted)",
                background: lg === footballLeague ? "var(--bg-card-hover)" : "transparent",
              }}
            >
              {lg}
            </button>
          ))}
        </div>
      ) : null}

      {categoryGroups !== null ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2 mt-2">
            {[ALL_GROUPS, ...catGroupsPresent].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => { setCatGroup(g === ALL_GROUPS ? null : g); setWflLeague(null); }}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={{
                  borderColor: (catGroup ?? ALL_GROUPS) === g ? "var(--accent)" : "var(--border)",
                  color: (catGroup ?? ALL_GROUPS) === g ? "var(--text)" : "var(--text-muted)",
                  background: (catGroup ?? ALL_GROUPS) === g ? "var(--bg-card-hover)" : "transparent",
                }}
              >
                {g}
              </button>
            ))}
          </div>
          {isWomensFootball ? (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[ALL_LEAGUES, ...wflLeaguesPresent].map((lg) => (
                <button
                  key={lg}
                  type="button"
                  onClick={() => setWflLeague(lg === ALL_LEAGUES ? null : lg)}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{
                    borderColor: (wflLeague ?? ALL_LEAGUES) === lg ? "var(--accent)" : "var(--border)",
                    color: (wflLeague ?? ALL_LEAGUES) === lg ? "var(--text)" : "var(--text-muted)",
                    background: (wflLeague ?? ALL_LEAGUES) === lg ? "var(--bg-card-hover)" : "transparent",
                  }}
                >
                  {lg}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-2" />
          )}
        </>
      ) : null}

      {isBuildTab ? (
        <div className="mb-4 mt-2">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-[var(--text-dim)] mr-1">Show:</span>
            {(["all", "men", "women"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setBuildGender(g)}
                className="inline-flex items-center justify-center min-h-[44px] rounded-full border px-3 text-xs"
                style={{
                  borderColor: buildGender === g ? "var(--accent)" : "var(--border)",
                  color: buildGender === g ? "var(--text)" : "var(--text-muted)",
                  background: buildGender === g ? "var(--bg-card-hover)" : "transparent",
                }}
              >
                {g === "all" ? "All" : g === "men" ? "Men's" : "Women's"}
              </button>
            ))}
            {buildSelection.size > 0 || buildGender !== "all" ? (
              <button
                type="button"
                onClick={clearBuild}
                className="inline-flex items-center justify-center min-h-[44px] rounded-full border px-3 text-xs ml-auto"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* Sport-level filters, first: one chip per sport, each with that
              sport's icon (from lib/sportLabels.ts, reused from the League
              column so the two can never disagree). Clicking a sport
              selects every one of its (present, gender-filtered) leagues;
              clicking again clears them. Mobile: this row scrolls
              horizontally within itself rather than wrapping, so it never
              forces the PAGE to scroll sideways; sm+ it wraps normally. */}
          <div className="mb-3">
            <div className="text-xs text-[var(--text-dim)] mb-1.5">Sport</div>
            <div className="flex gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
              {sportsPresent.map((sport) => {
                const { tokens } = sportLeaguesPresent.get(sport) ?? { tokens: [] };
                const state = sportSelectionState(sport, tokens);
                const icon = fanIndexSportIcon(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(tokens)}
                    aria-pressed={state === "all"}
                    className="inline-flex shrink-0 items-center justify-center gap-1 min-h-[44px] rounded-full border px-3 text-xs"
                    style={{
                      borderColor: state !== "none" ? "var(--accent)" : "var(--border)",
                      color: state !== "none" ? "var(--text)" : "var(--text-muted)",
                      background: state === "all" ? "var(--bg-card-hover)" : "transparent",
                    }}
                    title={state === "partial" ? `${sport}: some leagues selected` : sport}
                  >
                    {icon ? <span aria-hidden>{icon}</span> : null}
                    {sport}
                    {state === "partial" ? (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                        aria-label="partially selected"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact league refinement: collapsed by default, grouped by
              sport, small wrapping chip rows. Desktop flows the sport
              groups into 2-3 columns; at <640px it is a single stacked
              column (each group's own chips still wrap). */}
          <button
            type="button"
            onClick={() => setRefineOpen((v) => !v)}
            aria-expanded={refineOpen}
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] mb-2 hover:text-[var(--text)]"
          >
            <span aria-hidden>{refineOpen ? "\u25BE" : "\u25B8"}</span>
            Refine leagues ({buildSelection.size} selected)
          </button>
          {refineOpen ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mb-1 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              {sportsPresent.map((sport) => {
                const { leagues } = sportLeaguesPresent.get(sport) ?? { leagues: [] };
                if (leagues.length === 0) return null;
                const icon = fanIndexSportIcon(sport);
                return (
                  <div key={sport}>
                    <div className="text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      {icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}
                      {sport}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {leagues.map((lg) => {
                        const token = LEAGUE_KEY_BY_LEAGUE[lg];
                        const lgIcon = leagueIcon(lg);
                        const selected = token ? buildSelection.has(token) : false;
                        return (
                          <button
                            key={lg}
                            type="button"
                            onClick={() => token && toggleBuildToken(token)}
                            className="inline-flex items-center justify-center min-h-[32px] rounded-full border px-2.5 text-[11px]"
                            style={{
                              borderColor: selected ? "var(--accent)" : "var(--border)",
                              color: selected ? "var(--text)" : "var(--text-muted)",
                              background: selected ? "var(--bg-card-hover)" : "transparent",
                            }}
                            aria-pressed={selected}
                          >
                            {lgIcon ? <span className="mr-1" aria-hidden>{lgIcon}</span> : null}
                            {lg}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {isBuildTab && buildSelection.size === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-8 text-center">
          Pick a sport to start.
        </p>
      ) : (
        <SortableBoard
          id="fan-index"
          cols={cols}
          rows={rows}
          initial={{ key: "score", dir: "desc" }}
          mobileNoun="teams"
          mobileInitial={20}
        />
      )}
    </div>
  );
}
