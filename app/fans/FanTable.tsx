"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SortableBoard, { type BoardCol, type BoardRow } from "@/app/_shared/SortableBoard";
import { Sparkline } from "@/app/_shared/Sparkline";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const SPIKE_THRESHOLD = 2.5;
const FOOTBALL_LEAGUES = [
  "Premier League", "Championship", "La Liga", "Bundesliga", "Serie A",
  "Ligue 1", "Primeira Liga", "Eredivisie", "Süper Lig", "MLS", "Liga MX",
];
const WOMENS_FOOTBALL_LEAGUES = ["NWSL", "WSL"];
const MAJOR_AMERICAN_GROUPS = ["NFL", "NBA", "MLB", "NHL", "College football", "College basketball"];
const WORLD_GROUPS = [
  "WNBA", "Women's football", "F1", "EuroLeague", "AFL", "NRL", "IPL",
  "NPB", "CFL", "Top 14", "Handball-Bundesliga", "SuperLega",
];
const ALL_FOOTBALL = "All football";
const ALL_GROUPS = "All groups";
const ALL_LEAGUES = "All leagues";

const TOP_TABS = ["All", "Football", "Major American sports", "World"] as const;
type TopTab = (typeof TOP_TABS)[number];

export type FanTableTeam = {
  team: string;
  displayName: string;
  href: string | null;
  group: string;
  league: string;
  category: string;
  wikiBaseline12m: number;
  scoreInGroup: number;
  rankInGroup: number;
  rankInLeague: number;
  globalScore: number;
  globalRank: number;
  inFlux: string | null;
  inclusionRule: string | null;
  spikeRatio: number;
  monthly: (number | null)[];
  valueM: number | null;
  valSource: string | null;
  valYear: number | null;
  residualPct: number | null;
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
  const [masGroup, setMasGroup] = useState<string | null>(null);
  const [worldGroup, setWorldGroup] = useState<string | null>(null);
  const [wflLeague, setWflLeague] = useState<string | null>(null);

  function selectTopTab(tab: TopTab) {
    setTopTab(tab);
    setFootballLeague(ALL_FOOTBALL);
    setMasGroup(null);
    setWorldGroup(null);
    setWflLeague(null);
  }

  const isAllTab = topTab === "All";
  const isFootballTab = topTab === "Football";
  const isMasTab = topTab === "Major American sports";
  const isWorldTab = topTab === "World";
  const isWomensFootball = worldGroup === "Women's football";

  const footballLeaguesPresent = useMemo(
    () => FOOTBALL_LEAGUES.filter((lg) => teams.some((t) => t.group === "Football" && t.league === lg)),
    [teams],
  );
  const masGroupsPresent = useMemo(
    () => MAJOR_AMERICAN_GROUPS.filter((g) => teams.some((t) => t.category === "Major American sports" && t.group === g)),
    [teams],
  );
  const worldGroupsPresent = useMemo(
    () => WORLD_GROUPS.filter((g) => teams.some((t) => t.category === "World" && t.group === g)),
    [teams],
  );
  const wflLeaguesPresent = useMemo(
    () => WOMENS_FOOTBALL_LEAGUES.filter((lg) => teams.some((t) => t.group === "Women's football" && t.league === lg)),
    [teams],
  );

  // "Scoped" = the view is narrowed to one group (a league or a single
  // sport), so the Attention score compares teams within that group rather
  // than across the whole index.
  const scoped = isFootballTab || (isMasTab && masGroup !== null) || (isWorldTab && worldGroup !== null);
  const showLeagueRank =
    (isFootballTab && footballLeague !== ALL_FOOTBALL) ||
    (isWorldTab && isWomensFootball && wflLeague !== null);

  const filtered = useMemo(() => {
    if (isAllTab) return teams;
    if (isFootballTab) {
      let rows = teams.filter((t) => t.group === "Football");
      if (footballLeague !== ALL_FOOTBALL) rows = rows.filter((t) => t.league === footballLeague);
      return rows;
    }
    if (isMasTab) {
      let rows = teams.filter((t) => t.category === "Major American sports");
      if (masGroup) rows = rows.filter((t) => t.group === masGroup);
      return rows;
    }
    // World
    let rows = teams.filter((t) => t.category === "World");
    if (worldGroup) {
      rows = rows.filter((t) => t.group === worldGroup);
      if (worldGroup === "Women's football" && wflLeague) rows = rows.filter((t) => t.league === wflLeague);
    }
    return rows;
  }, [teams, isAllTab, isFootballTab, isMasTab, footballLeague, masGroup, worldGroup, wflLeague]);

  const cols: BoardCol[] = [
    { key: "team", label: "Team", sortable: true, className: "min-w-[10rem]" },
    scoped
      ? { key: "league", label: "League", sortable: true, demote: "md", short: "League" }
      : { key: "group", label: "Group / League", sortable: true, demote: "md", short: "Group" },
    ...(showLeagueRank
      ? [{ key: "leagueRank", label: "Lg #", right: true, sortable: true, demote: "sm", title: `Rank within ${isFootballTab ? footballLeague : wflLeague}` } as BoardCol]
      : []),
    { key: "score", label: "Attention", right: true, sortable: true, title: scoped ? "0 to 100, scaled to the top team in its group" : "0 to 100, share of the single most-watched team across all sports" },
    { key: "baseline", label: "Baseline views", right: true, sortable: true, demote: "sm", title: "Median monthly all-language Wikipedia views x 12 (spike-dampened)" },
    { key: "trend", label: "12mo", right: false, sortable: false, demote: "md", className: "w-24" },
    { key: "value", label: "Valuation", right: true, sortable: true },
    { key: "residual", label: "vs attention", right: true, sortable: true, demote: "sm", title: "Actual valuation vs. what the group's attention-value line predicts; n/a where the group's fit is too weak (R² < 0.4)" },
  ];

  const rows: BoardRow[] = filtered.map((t) => {
    const residualCell = t.valueM == null
      ? <span className="text-[var(--text-dim)]">—</span>
      : !t.residualEligible
        ? <span className="text-[var(--text-dim)] text-xs" title="This group's attention-to-value fit is too weak (R² < 0.4) for a residual to mean much.">n/a*</span>
        : <DivergingBar v={t.residualPct} dp={0} suffix="%" />;

    const score = scoped ? t.scoreInGroup : t.globalScore;

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
        residual: t.residualEligible ? t.residualPct : null,
      },
      cells: [
        <TeamCell key="team" t={t} />,
        scoped
          ? <span key="league" className="text-[var(--text-muted)]">{t.league}</span>
          : <span key="group" className="text-[var(--text-muted)]">{t.group}{t.group !== t.league ? <> <span className="text-[var(--text-dim)]">{"·"}</span> {t.league}</> : null}</span>,
        ...(showLeagueRank ? [<DataBar key="leagueRank" v={t.rankInLeague} dp={0} />] : []),
        <DataBar key="score" v={score} dp={1} />,
        <DataBar key="baseline" v={t.wikiBaseline12m} format={formatCompact} />,
        <Sparkline
          key="trend"
          values={t.monthly}
          label={`${t.displayName} monthly Wikipedia views, last 12 months`}
        />,
        t.valueM == null
          ? <span key="value" className="text-[var(--text-dim)]">—</span>
          : <span key="value" className="tabular-nums text-xs" title={t.valSource ? `${t.valSource}${t.valYear ? ` (${t.valYear})` : ""}` : undefined}>{formatValueM(t.valueM)}</span>,
        residualCell,
      ],
      mobile: {
        name: <TeamCell key="team" t={t} />,
        sub: <span>{scoped ? t.league : (t.group === t.league ? t.group : `${t.group} · ${t.league}`)}</span>,
        right: <span style={MONO}>{score.toFixed(1)}</span>,
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
          Across sports, teams are ranked on absolute fan attention, not on their standing inside their own league.
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

      {isMasTab ? (
        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
          {[ALL_GROUPS, ...masGroupsPresent].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setMasGroup(g === ALL_GROUPS ? null : g)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: (masGroup ?? ALL_GROUPS) === g ? "var(--accent)" : "var(--border)",
                color: (masGroup ?? ALL_GROUPS) === g ? "var(--text)" : "var(--text-muted)",
                background: (masGroup ?? ALL_GROUPS) === g ? "var(--bg-card-hover)" : "transparent",
              }}
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}

      {isWorldTab ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2 mt-2">
            {[ALL_GROUPS, ...worldGroupsPresent].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => { setWorldGroup(g === ALL_GROUPS ? null : g); setWflLeague(null); }}
                className="rounded-full border px-2.5 py-1 text-xs"
                style={{
                  borderColor: (worldGroup ?? ALL_GROUPS) === g ? "var(--accent)" : "var(--border)",
                  color: (worldGroup ?? ALL_GROUPS) === g ? "var(--text)" : "var(--text-muted)",
                  background: (worldGroup ?? ALL_GROUPS) === g ? "var(--bg-card-hover)" : "transparent",
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

      <SortableBoard
        id="fan-index"
        cols={cols}
        rows={rows}
        initial={{ key: "score", dir: "desc" }}
        mobileNoun="teams"
        mobileInitial={20}
      />
    </div>
  );
}
