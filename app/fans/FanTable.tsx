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
const ALL_FOOTBALL = "All football";

export type FanTableTeam = {
  team: string;
  displayName: string;
  href: string | null;
  group: string;
  league: string;
  wikiBaseline12m: number;
  scoreInGroup: number;
  rankInGroup: number;
  rankInLeague: number;
  globalScore: number;
  globalRank: number;
  inFlux: string | null;
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
    </>
  );
  return t.href ? (
    <Link href={t.href} className="hover:underline">{inner}</Link>
  ) : (
    <span>{inner}</span>
  );
}

export default function FanTable({ teams, groups }: { teams: FanTableTeam[]; groups: string[] }) {
  const [group, setGroup] = useState<string>("All");
  const [leagueFilter, setLeagueFilter] = useState<string>(ALL_FOOTBALL);
  const tabs = ["All", ...groups];
  const isAll = group === "All";
  const isFootball = group === "Football";

  const footballLeaguesPresent = useMemo(
    () => FOOTBALL_LEAGUES.filter((lg) => teams.some((t) => t.group === "Football" && t.league === lg)),
    [teams],
  );

  const filtered = useMemo(() => {
    if (isAll) return teams;
    let rows = teams.filter((t) => t.group === group);
    if (isFootball && leagueFilter !== ALL_FOOTBALL) rows = rows.filter((t) => t.league === leagueFilter);
    return rows;
  }, [teams, group, isAll, isFootball, leagueFilter]);

  const showLeagueRank = isFootball && leagueFilter !== ALL_FOOTBALL;

  const cols: BoardCol[] = [
    { key: "team", label: "Team", sortable: true, className: "min-w-[10rem]" },
    isAll
      ? { key: "group", label: "Group / League", sortable: true, demote: "md", short: "Group" }
      : { key: "league", label: "League", sortable: true, demote: "md", short: "League" },
    ...(showLeagueRank
      ? [{ key: "leagueRank", label: "Lg #", right: true, sortable: true, demote: "sm", title: `Rank within ${leagueFilter}` } as BoardCol]
      : []),
    { key: "score", label: "Attention", right: true, sortable: true, title: isAll ? "0 to 100, share of the single most-watched team across all sports" : "0 to 100, scaled to the top team in its group" },
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

    const score = isAll ? t.globalScore : t.scoreInGroup;

    return {
      key: `${t.group}-${t.league}-${t.team}`,
      sort: {
        team: t.displayName,
        group: `${t.group}, ${t.league}`,
        league: t.league,
        leagueRank: showLeagueRank ? -t.rankInLeague : null,
        score,
        baseline: t.wikiBaseline12m,
        value: t.valueM,
        residual: t.residualEligible ? t.residualPct : null,
      },
      cells: [
        <TeamCell key="team" t={t} />,
        isAll
          ? <span key="group" className="text-[var(--text-muted)]">{t.group} <span className="text-[var(--text-dim)]">{"·"}</span> {t.league}</span>
          : <span key="league" className="text-[var(--text-muted)]">{t.league}</span>,
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
        sub: <span>{isAll ? `${t.group} · ${t.league}` : t.league}</span>,
        right: <span style={MONO}>{score.toFixed(1)}</span>,
        rightSub: t.valueM != null ? formatValueM(t.valueM) : undefined,
      },
    };
  });

  return (
    <div>
      <div className="flex flex-wrap gap-x-1 gap-y-1 border-b mb-1" style={{ borderColor: "var(--border)" }}>
        {tabs.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => { setGroup(g); setLeagueFilter(ALL_FOOTBALL); }}
            className="px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              borderBottom: g === group ? "2px solid var(--accent)" : "2px solid transparent",
              color: g === group ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {isAll ? (
        <p className="text-xs text-[var(--text-dim)] mb-4">
          Across sports, teams are ranked on absolute fan attention, not on their standing inside their own league.
        </p>
      ) : null}

      {isFootball ? (
        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
          {[ALL_FOOTBALL, ...footballLeaguesPresent].map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setLeagueFilter(lg)}
              className="rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: lg === leagueFilter ? "var(--accent)" : "var(--border)",
                color: lg === leagueFilter ? "var(--text)" : "var(--text-muted)",
                background: lg === leagueFilter ? "var(--bg-card-hover)" : "transparent",
              }}
            >
              {lg}
            </button>
          ))}
        </div>
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
