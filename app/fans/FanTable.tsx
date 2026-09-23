"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SortableBoard, { type BoardCol, type BoardRow } from "@/app/_shared/SortableBoard";
import { Sparkline } from "@/app/_shared/Sparkline";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const SPIKE_THRESHOLD = 2.5;

export type FanTableTeam = {
  team: string;
  displayName: string;
  href: string | null;
  group: string;
  league: string;
  baseline_12m: number;
  all_lang_views_12m: number;
  lang_count: number;
  spike_ratio: number;
  attention_score: number;
  rank_in_group: number;
  monthly: (number | null)[];
  value_m: number | null;
  val_source: string | null;
  val_year: number | null;
  residual_pct: number | null;
  residual_eligible: boolean;
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

function TeamCell({ t }: { t: FanTableTeam }) {
  const inner = (
    <>
      <span className="font-medium">{t.displayName}</span>
      {t.spike_ratio >= SPIKE_THRESHOLD ? (
        <span
          className="ml-1.5 inline-block text-[var(--seq-4)]"
          title={`Event-driven spike: this team's busiest month drew ${t.spike_ratio.toFixed(1)}x its typical month.`}
          aria-label="Event-driven spike"
        >
          ⚡
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
  const [group, setGroup] = useState<string>(groups[0] ?? "All");
  const tabs = ["All", ...groups];

  const filtered = useMemo(
    () => (group === "All" ? teams : teams.filter((t) => t.group === group)),
    [teams, group],
  );

  const cols: BoardCol[] = [
    { key: "team", label: "Team", sortable: true, className: "min-w-[10rem]" },
    { key: "league", label: "League", sortable: true, demote: "md", short: "League" },
    { key: "score", label: "Attention", right: true, sortable: true, title: "0 to 100, scaled to the top team in its group by baseline_12m" },
    { key: "baseline", label: "Baseline views", right: true, sortable: true, demote: "sm", title: "Median monthly all-language Wikipedia views x 12 (spike-dampened)" },
    { key: "langs", label: "Langs", right: true, sortable: true, demote: "lg", title: "Wikipedia language editions with a sitelink for this team" },
    { key: "trend", label: "12mo", right: false, sortable: false, demote: "md", className: "w-24" },
    { key: "value", label: "Valuation", right: true, sortable: true },
    { key: "residual", label: "vs attention", right: true, sortable: true, demote: "sm", title: "Actual valuation vs. what the group's attention-value line predicts; n/a where the group's fit is too weak (R² < 0.4)" },
  ];

  const rows: BoardRow[] = filtered.map((t) => {
    const residualCell = t.value_m == null
      ? <span className="text-[var(--text-dim)]">—</span>
      : !t.residual_eligible
        ? <span className="text-[var(--text-dim)] text-xs" title="This group's attention-to-value fit is too weak (R² < 0.4) for a residual to mean much.">n/a*</span>
        : <DivergingBar v={t.residual_pct} dp={0} suffix="%" />;

    return {
      key: `${t.league}-${t.team}`,
      sort: {
        team: t.displayName,
        league: t.league,
        score: t.attention_score,
        baseline: t.baseline_12m,
        langs: t.lang_count,
        value: t.value_m,
        residual: t.residual_eligible ? t.residual_pct : null,
      },
      cells: [
        <TeamCell key="team" t={t} />,
        <span key="league" className="text-[var(--text-muted)]">{t.league}</span>,
        <DataBar key="score" v={t.attention_score} dp={1} />,
        <DataBar key="baseline" v={t.baseline_12m} format={formatCompact} />,
        <DataBar key="langs" v={t.lang_count} dp={0} />,
        <Sparkline
          key="trend"
          values={t.monthly}
          label={`${t.displayName} monthly Wikipedia views, last 12 months`}
        />,
        t.value_m == null
          ? <span key="value" className="text-[var(--text-dim)]">—</span>
          : <span key="value" className="tabular-nums text-xs" title={t.val_source ? `${t.val_source}${t.val_year ? ` (${t.val_year})` : ""}` : undefined}>{formatValueM(t.value_m)}</span>,
        residualCell,
      ],
      mobile: {
        name: <TeamCell key="team" t={t} />,
        sub: <span>{t.league} · {t.lang_count} languages</span>,
        right: <span style={MONO}>{t.attention_score.toFixed(1)}</span>,
        rightSub: t.value_m != null ? formatValueM(t.value_m) : undefined,
      },
    };
  });

  return (
    <div>
      <div className="flex flex-wrap gap-x-1 gap-y-1 border-b mb-4" style={{ borderColor: "var(--border)" }}>
        {tabs.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
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
