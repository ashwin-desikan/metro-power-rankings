"use client";

import { useMemo, useState } from "react";
import { Sparkline } from "@/app/_shared/Sparkline";
import { FAN_INDEX_SPORTS, FAN_INDEX_SPORT_LEAGUES, fanIndexSportIcon, leagueIcon } from "@/lib/sportLabels";
import type { HistoryPayload, HistoryTeamOut } from "@/app/api/fans/history/route";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

// A small fixed categorical set built from the site's own tokens (only 5
// --seq steps exist, a sequential teal ramp, not a categorical one -- see
// app/globals.css). Color here is a secondary cue only: every line and
// every chip also carries its name as text, so identity never rests on
// color alone (dataviz skill, "identity never color alone").
const PALETTE = [
  "var(--accent)", "var(--seq-5)", "var(--seq-3)", "var(--seq-1)",
  "#E8A33D", "#C4577A", "var(--seq-4)", "var(--seq-2)",
] as const;

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

// The normalized measure (views per billion trailing-12-month Wikipedia
// views) runs in the single-to-low-hundreds range for most teams, not the
// millions formatCompact was built for -- Math.round would flatten a value
// like 6.4 down to "6" and lose the only precision that measure has at
// that scale, so it gets its own formatter, one decimal place, falling
// back to formatCompact only once it is large enough (a whole big league's
// total, cross-sport-scaled) for that to make sense.
function formatNormalized(n: number): string {
  if (n >= 1_000) return formatCompact(n);
  return n.toFixed(1);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

// ---------------------------------------------------------------------
// LineChart: a small multi-series line chart, no library (matches
// app/_shared/Sparkline.tsx's "deliberately no chart library" choice --
// see that file's doc comment). Unlike Sparkline, this is a full chart:
// it carries a baseline, a handful of month ticks, per-point hover titles,
// and (optionally) a direct end-of-line label per series.
// ---------------------------------------------------------------------
type ChartSeries = { key: string; label: string; color: string; points: (number | null)[] };

function LineChart({
  months,
  series,
  height = 240,
  logScale = false,
  directLabels = true,
  valueFormat = formatCompact,
}: {
  months: string[];
  series: ChartSeries[];
  height?: number;
  logScale?: boolean;
  directLabels?: boolean;
  valueFormat?: (v: number) => string;
}) {
  const W = 760;
  const H = height;
  const padding = { left: 8, right: directLabels ? 118 : 16, top: 10, bottom: 22 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  const tx = (v: number) => (logScale ? Math.log10(Math.max(v, 1)) : v);

  const allVals = series.flatMap((s) => s.points.filter((v): v is number => v != null && v > 0).map(tx));
  const yMin = allVals.length ? Math.min(...allVals) : 0;
  const yMax = allVals.length ? Math.max(...allVals) : 1;
  const ySpan = yMax - yMin || 1;

  const n = Math.max(months.length - 1, 1);
  const xAt = (i: number) => padding.left + (i / n) * plotW;
  const yAt = (v: number) => padding.top + (1 - (tx(v) - yMin) / ySpan) * plotH;

  if (months.length < 2 || series.every((s) => s.points.every((v) => v == null))) {
    return <p className="text-sm text-[var(--text-dim)] py-8 text-center">Not enough data yet.</p>;
  }

  // A handful of x-axis ticks, evenly spaced, never one per month (33
  // months of labels would collide badly at this width).
  const tickCount = Math.min(7, months.length);
  const tickIdxs = Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * n));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Attention over time chart">
      <line x1={padding.left} y1={H - padding.bottom} x2={W - padding.right} y2={H - padding.bottom} stroke="var(--border)" strokeWidth={1} />
      {tickIdxs.map((i) => (
        <text key={i} x={xAt(i)} y={H - padding.bottom + 14} fontSize={9} textAnchor="middle" fill="var(--text-dim)" style={MONO}>
          {monthLabel(months[i])}
        </text>
      ))}
      {series.map((s) => {
        let d = "";
        let open = false;
        let lastDefined: { i: number; v: number } | null = null;
        s.points.forEach((v, i) => {
          if (v == null || v <= 0) {
            open = false;
            return;
          }
          const x = xAt(i);
          const y = yAt(v);
          d += open ? ` L ${x},${y}` : ` M ${x},${y}`;
          open = true;
          lastDefined = { i, v };
        });
        return (
          <g key={s.key}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
            {s.points.map((v, i) =>
              v != null && v > 0 ? (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r={2.4} fill={s.color} opacity={0.55}>
                  <title>{`${s.label}, ${monthLabel(months[i])}: ${valueFormat(v)}`}</title>
                </circle>
              ) : null,
            )}
            {lastDefined ? (
              <>
                <circle cx={xAt((lastDefined as { i: number; v: number }).i)} cy={yAt((lastDefined as { i: number; v: number }).v)} r={3.2} fill={s.color} />
                {directLabels ? (
                  <text
                    x={xAt((lastDefined as { i: number; v: number }).i) + 6}
                    y={yAt((lastDefined as { i: number; v: number }).v) + 3}
                    fontSize={10.5}
                    fill={s.color}
                  >
                    {s.label}
                  </text>
                ) : null}
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
  multi = true,
}: {
  options: string[];
  selected: Set<string> | string | null;
  onToggle: (v: string) => void;
  multi?: boolean;
}) {
  const isSelected = (v: string) => (selected instanceof Set ? selected.has(v) : selected === v);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((v) => {
        const on = isSelected(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            aria-pressed={multi ? on : undefined}
            className="inline-flex items-center justify-center min-h-[32px] rounded-full border px-2.5 text-[11px]"
            style={{
              borderColor: on ? "var(--accent)" : "var(--border)",
              color: on ? "var(--text)" : "var(--text-muted)",
              background: on ? "var(--bg-card-hover)" : "transparent",
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// (a) Compare teams
// ---------------------------------------------------------------------
const DEFAULT_TEAMS: { team: string; group: string }[] = [
  { team: "Real Madrid", group: "Football" },
  { team: "Dallas Cowboys", group: "NFL" },
  { team: "New York Knicks", group: "NBA" },
  { team: "Indiana", group: "College football" },
  { team: "Arsenal", group: "Football" },
];

function CompareTeams({ data, useNormalized }: { data: HistoryPayload; useNormalized: boolean }) {
  const byKey = useMemo(() => new Map(data.teams.map((t) => [t.key, t])), [data.teams]);
  const defaultKeys = useMemo(
    () =>
      DEFAULT_TEAMS.map((d) => data.teams.find((t) => t.team === d.team && t.group === d.group)?.key).filter(
        (k): k is string => !!k,
      ),
    [data.teams],
  );
  const [selected, setSelected] = useState<string[]>(defaultKeys);
  const [query, setQuery] = useState("");
  const [logScale, setLogScale] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return data.teams
      .filter((t) => !selected.includes(t.key) && (t.display_name.toLowerCase().includes(q) || t.team.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, data.teams, selected]);

  function add(key: string) {
    setSelected((prev) => (prev.length >= 5 || prev.includes(key) ? prev : [...prev, key]));
    setQuery("");
  }
  function remove(key: string) {
    setSelected((prev) => prev.filter((k) => k !== key));
  }

  const series: ChartSeries[] = selected
    .map((k) => byKey.get(k))
    .filter((t): t is HistoryTeamOut => !!t)
    .map((t) => ({ key: t.key, label: t.display_name, color: colorFor(t.key), points: useNormalized ? t.normalized : t.series }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a team to add (up to 5)"
            className="rounded-full border px-3 py-1.5 text-[12.5px] bg-transparent min-h-[36px] w-64 max-w-full"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          />
          {suggestions.length > 0 ? (
            <div
              className="absolute z-10 mt-1 w-72 max-w-[80vw] rounded-lg border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              {suggestions.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => add(t.key)}
                  className="block w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--bg-card-hover)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t.display_name} <span className="text-[var(--text-dim)]">· {t.league}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setLogScale((v) => !v)}
          aria-pressed={logScale}
          className="inline-flex items-center justify-center min-h-[36px] rounded-full border px-3 text-[12px]"
          style={{
            borderColor: logScale ? "var(--accent)" : "var(--border)",
            color: logScale ? "var(--text)" : "var(--text-muted)",
            background: logScale ? "var(--bg-card-hover)" : "transparent",
          }}
        >
          Log scale
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {series.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
            <button type="button" onClick={() => remove(s.key)} aria-label={`Remove ${s.label}`} className="text-[var(--text-dim)] ml-0.5">
              &times;
            </button>
          </span>
        ))}
      </div>

      {series.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)] py-8 text-center">Search for a team above to compare it.</p>
      ) : (
        <>
          <LineChart months={data.months} series={series} logScale={logScale} valueFormat={useNormalized ? formatNormalized : formatCompact} />
          <Legend series={series} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// (b) Biggest movers
// ---------------------------------------------------------------------
type MoverRow = { team: HistoryTeamOut; ppChange: number; shareA: number; shareB: number };

// Every stored monthly value is ALREADY a trailing-12-month total (see
// HistoryTeamOut.series's comment in app/api/fans/history/route.ts), so
// "last 12 months vs. the 12 months before" means comparing two SINGLE
// MONTH data points a year apart -- e.g. 2026-08 vs 2025-08 -- not
// re-averaging 12 raw monthly values into an artificial period average the
// way an earlier version of this component did. The API already trims the
// months array to the clean window (TRENDS_CLEAN_FROM), so `data.months[0]`
// is always a clean month; if fewer than 13 clean months exist yet, this
// falls back to comparing the latest month with that earliest clean month
// instead of the exact 12-months-earlier point, and says so.
function BiggestMovers({ data, useNormalized }: { data: HistoryPayload; useNormalized: boolean }) {
  const leagues = useMemo(() => Array.from(new Set(data.teams.map((t) => t.league))).sort(), [data.teams]);
  const [league, setLeague] = useState<string>(() => (leagues.includes("Premier League") ? "Premier League" : leagues[0] ?? ""));

  const pointsFor = (t: HistoryTeamOut) => (useNormalized ? t.normalized : t.series);

  const { risers, fallers, latestIdx, pastIdx, usedFallback } = useMemo(() => {
    const n = data.months.length;
    const latest = n - 1;
    const exact = latest - 12;
    const past = exact >= 0 ? exact : 0;
    const fallback = exact < 0 && n > 1;
    const leagueTeams = data.teams.filter((t) => t.league === league);

    const withPoints = leagueTeams
      .map((t) => ({ t, a: pointsFor(t)[latest], b: pointsFor(t)[past] }))
      .filter((r): r is { t: HistoryTeamOut; a: number; b: number } => r.a != null && r.b != null);

    const totalA = withPoints.reduce((s, r) => s + r.a, 0);
    const totalB = withPoints.reduce((s, r) => s + r.b, 0);

    const rows: MoverRow[] = withPoints.map((r) => {
      const shareA = totalA > 0 ? r.a / totalA : 0;
      const shareB = totalB > 0 ? r.b / totalB : 0;
      return { team: r.t, shareA, shareB, ppChange: (shareA - shareB) * 100 };
    });

    const sorted = rows.slice().sort((a, b) => b.ppChange - a.ppChange);
    return {
      risers: sorted.slice(0, 5),
      fallers: sorted.slice(-5).reverse(),
      latestIdx: latest,
      pastIdx: past,
      usedFallback: fallback,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.teams, data.months.length, league, useNormalized]);

  function MoverTable({ title, rows }: { title: string; rows: MoverRow[] }) {
    return (
      <div>
        <div className="text-xs font-semibold text-[var(--text-dim)] mb-1.5">{title}</div>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-[var(--text-dim)]" colSpan={3}>
                    Not enough data for this league yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.team.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-medium max-w-[9rem] truncate">{r.team.display_name}</td>
                    <td className="px-3 py-2 w-20">
                      <Sparkline
                        values={pointsFor(r.team).slice(pastIdx)}
                        label={`${r.team.display_name} attention, ${monthLabel(data.months[pastIdx])} to ${monthLabel(data.months[latestIdx])}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.ppChange >= 0 ? "var(--accent)" : "var(--text-muted)" }}>
                      {r.ppChange >= 0 ? "+" : ""}
                      {r.ppChange.toFixed(2)}pp
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const periodLabel = latestIdx >= 0 && pastIdx >= 0 ? `${monthLabel(data.months[pastIdx])} vs. ${monthLabel(data.months[latestIdx])}` : "";

  return (
    <div>
      <div className="mb-3">
        <ChipRow options={leagues} selected={league} onToggle={setLeague} multi={false} />
      </div>
      <p className="text-[12px] text-[var(--text-dim)] mb-3">
        Change in each team&apos;s share of {league || "the league"}&apos;s total attention, {periodLabel}, in
        percentage points.{" "}
        {usedFallback
          ? "Fewer than 13 clean months are available yet, so this compares the latest month with the earliest clean month instead of the exact 12-months-earlier point."
          : "Comparing two single months a year apart, not averaged spans, since each stored value is already a trailing 12-month total."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoverTable title="Biggest risers" rows={risers} />
        <MoverTable title="Biggest fallers" rows={fallers} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// (c) League attention over time
// ---------------------------------------------------------------------
//
// v2 (2026-09-24): the earlier index-to-100 version showed GROWTH, not
// SIZE -- it put the NFL behind MLB and every big European league far
// behind the major American ones, which does not match how the index
// itself ranks leagues. Replaced with three absolute views instead of one
// indexed one: "Cross-sport attention" (the default -- each league's total
// trailing-12-month baseline times its k_league, the same scaling the All
// view uses, so this chart ranks leagues the way the index does), "Raw
// Wikipedia attention" (the same totals with no scaling -- football leads
// here, by nature, since Wikipedia is football's de facto reference site),
// and "Share of total" (each shown league's percentage of the sum across
// the OTHER currently shown leagues, so it moves as chips are toggled).
type LeagueViewMode = "cross" | "raw" | "share";
const LEAGUE_VIEW_MODES: { key: LeagueViewMode; label: string }[] = [
  { key: "cross", label: "Cross-sport attention" },
  { key: "raw", label: "Raw Wikipedia attention" },
  { key: "share", label: "Share of total" },
];

function formatShare(v: number): string {
  return `${v.toFixed(1)}%`;
}

function LeagueAttentionOverTime({ data, useNormalized }: { data: HistoryPayload; useNormalized: boolean }) {
  // Trailing-12-month baseline per league per month -- already de-
  // seasonalised (each point is a 12-month total, not one month's raw
  // traffic), so this is the same "no seasonal swing" series the other
  // two sections use, just summed across a league's teams.
  const leagueTotals = useMemo(() => {
    const byLeague = new Map<string, (number | null)[]>();
    for (const t of data.teams) {
      let arr = byLeague.get(t.league);
      if (!arr) {
        arr = new Array(data.months.length).fill(null);
        byLeague.set(t.league, arr);
      }
      const points = useNormalized ? t.normalized : t.series;
      points.forEach((v, i) => {
        if (v == null) return;
        arr![i] = (arr![i] ?? 0) + v;
      });
    }
    return byLeague;
  }, [data.teams, data.months.length, useNormalized]);

  const leagues = useMemo(() => Array.from(leagueTotals.keys()).sort(), [leagueTotals]);
  const latestIdx = data.months.length - 1;
  const pastIdx = latestIdx - 12;

  // Cross-sport value at the latest month, for every league -- computed
  // once, independent of the view-mode toggle, since it is what decides
  // the DEFAULT 8 leagues shown (per spec: "the 8 largest leagues by the
  // latest cross-sport value"), not whichever mode happens to be active.
  const crossAtLatest = useMemo(() => {
    const map = new Map<string, number>();
    if (latestIdx < 0) return map;
    for (const lg of leagues) {
      const k = data.leagueKLeague[lg];
      const raw = leagueTotals.get(lg)?.[latestIdx];
      map.set(lg, raw != null && k != null ? raw * k : -Infinity);
    }
    return map;
  }, [leagues, leagueTotals, data.leagueKLeague, latestIdx]);

  const defaultShown = useMemo(
    () => leagues.slice().sort((a, b) => (crossAtLatest.get(b) ?? -Infinity) - (crossAtLatest.get(a) ?? -Infinity)).slice(0, 8),
    [leagues, crossAtLatest],
  );

  const [shown, setShown] = useState<Set<string>>(() => new Set(defaultShown));
  const [viewMode, setViewMode] = useState<LeagueViewMode>("cross");
  const [logScale, setLogScale] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);

  function toggle(lg: string) {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }

  // The value for one league, one month, under the current view mode.
  // "share" divides by the sum across `shownSet` (not every league in the
  // dataset), so it moves as chips are toggled, per spec.
  function valueFor(lg: string, monthIdx: number, mode: LeagueViewMode, shownSet: Set<string>): number | null {
    if (monthIdx < 0) return null;
    const raw = leagueTotals.get(lg)?.[monthIdx];
    if (raw == null) return null;
    if (mode === "raw") return raw;
    const k = data.leagueKLeague[lg];
    if (k == null) return null;
    const cross = raw * k;
    if (mode === "cross") return cross;
    let total = 0;
    for (const other of shownSet) {
      const otherRaw = leagueTotals.get(other)?.[monthIdx];
      const otherK = data.leagueKLeague[other];
      if (otherRaw != null && otherK != null) total += otherRaw * otherK;
    }
    return total > 0 ? (cross / total) * 100 : null;
  }

  const series: ChartSeries[] = Array.from(shown)
    .map((lg) => {
      const points = data.months.map((_, i) => valueFor(lg, i, viewMode, shown));
      if (points.every((v) => v == null)) return null;
      return { key: lg, label: lg, color: colorFor(lg), points };
    })
    .filter((s): s is ChartSeries => s != null);

  const valueFormat = viewMode === "share" ? formatShare : useNormalized ? formatNormalized : formatCompact;

  const tableRows = useMemo(() => {
    if (pastIdx < 0) return [];
    const rows = Array.from(shown)
      .map((lg) => ({
        league: lg,
        latest: valueFor(lg, latestIdx, viewMode, shown),
        past: valueFor(lg, pastIdx, viewMode, shown),
      }))
      .filter((r): r is { league: string; latest: number; past: number | null } => r.latest != null);
    const byLatestDesc = rows.slice().sort((a, b) => b.latest - a.latest);
    const byPastDesc = rows
      .filter((r): r is { league: string; latest: number; past: number } => r.past != null)
      .sort((a, b) => b.past - a.past);
    const rankNow = new Map(byLatestDesc.map((r, i) => [r.league, i + 1]));
    const rankPast = new Map(byPastDesc.map((r, i) => [r.league, i + 1]));
    return byLatestDesc.map((r) => ({
      league: r.league,
      latest: r.latest,
      changePct: r.past != null && r.past !== 0 ? ((r.latest - r.past) / r.past) * 100 : null,
      rankNow: rankNow.get(r.league) ?? null,
      rankPast: rankPast.get(r.league) ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, viewMode, leagueTotals, data.leagueKLeague, latestIdx, pastIdx]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {LEAGUE_VIEW_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setViewMode(m.key)}
            aria-pressed={viewMode === m.key}
            className="inline-flex items-center justify-center min-h-[36px] rounded-full border px-3 text-[12px]"
            style={{
              borderColor: viewMode === m.key ? "var(--accent)" : "var(--border)",
              color: viewMode === m.key ? "var(--text)" : "var(--text-muted)",
              background: viewMode === m.key ? "var(--bg-card-hover)" : "transparent",
            }}
          >
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLogScale((v) => !v)}
          aria-pressed={logScale}
          className="inline-flex items-center justify-center min-h-[36px] rounded-full border px-3 text-[12px]"
          style={{
            borderColor: logScale ? "var(--accent)" : "var(--border)",
            color: logScale ? "var(--text)" : "var(--text-muted)",
            background: logScale ? "var(--bg-card-hover)" : "transparent",
          }}
        >
          Log scale
        </button>
      </div>

      <button
        type="button"
        onClick={() => setRefineOpen((v) => !v)}
        aria-expanded={refineOpen}
        className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] mb-2 hover:text-[var(--text)]"
      >
        <span aria-hidden>{refineOpen ? "▾" : "▸"}</span>
        Leagues shown ({shown.size})
      </button>
      {refineOpen ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mb-3 rounded-xl border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          {FAN_INDEX_SPORTS.map((sport) => {
            const sportLeagues = FAN_INDEX_SPORT_LEAGUES[sport].filter((lg) => leagues.includes(lg));
            if (sportLeagues.length === 0) return null;
            const icon = fanIndexSportIcon(sport);
            return (
              <div key={sport}>
                <div className="text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  {icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}
                  {sport}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sportLeagues.map((lg) => {
                    const selected = shown.has(lg);
                    return (
                      <button
                        key={lg}
                        type="button"
                        onClick={() => toggle(lg)}
                        aria-pressed={selected}
                        className="inline-flex items-center justify-center min-h-[32px] rounded-full border px-2.5 text-[11px]"
                        style={{
                          borderColor: selected ? "var(--accent)" : "var(--border)",
                          color: selected ? "var(--text)" : "var(--text-muted)",
                          background: selected ? "var(--bg-card-hover)" : "transparent",
                        }}
                      >
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

      {series.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)] py-8 text-center">Pick a league above to show its line.</p>
      ) : (
        <>
          <LineChart months={data.months} series={series} logScale={logScale} directLabels={series.length <= 8} valueFormat={valueFormat} />
          <Legend series={series} />
        </>
      )}

      {tableRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border mt-4" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm" style={{ minWidth: 420 }} data-static-sort="ranked by the latest value of the view shown in the chart above">
            <thead>
              <tr className="text-left text-[var(--text-dim)] text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2 text-right">Latest</th>
                <th className="px-3 py-2 text-right">vs. 12mo earlier</th>
                <th className="px-3 py-2 text-right">Rank now</th>
                <th className="px-3 py-2 text-right">Rank 12mo ago</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const icon = leagueIcon(r.league);
                return (
                  <tr key={r.league} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      {icon ? <span className="mr-1" aria-hidden>{icon}</span> : null}
                      {r.league}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{valueFormat(r.latest)}</td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: r.changePct == null ? "var(--text-dim)" : r.changePct >= 0 ? "var(--accent)" : "var(--text-muted)" }}
                    >
                      {r.changePct == null ? "n/a" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rankNow ?? "n/a"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rankPast ?? "n/a"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[12px] text-[var(--text-dim)] mt-2">
        Every value is a trailing 12-month total per league (each point already spans a full year, so
        there is no seasonal swing to read into it). &quot;Cross-sport attention&quot; applies the same
        revenue-based league scaling the All view uses, so leagues compare the way the index itself
        ranks them. &quot;Raw Wikipedia attention&quot; is the same totals unscaled -- football leads
        here by nature, since Wikipedia is football&apos;s de facto reference site in a way it is not
        for US sports. &quot;Share of total&quot; is each shown league&apos;s percentage of the sum
        across the other leagues currently shown, so it moves when you add or remove one.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------

export default function TrendsClient({ data }: { data: HistoryPayload }) {
  const [useNormalized, setUseNormalized] = useState(true);

  return (
    <div className="space-y-10">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => setUseNormalized(true)}
            aria-pressed={useNormalized}
            className="inline-flex items-center justify-center min-h-[36px] rounded-full border px-3 text-[12px]"
            style={{
              borderColor: useNormalized ? "var(--accent)" : "var(--border)",
              color: useNormalized ? "var(--text)" : "var(--text-muted)",
              background: useNormalized ? "var(--bg-card-hover)" : "transparent",
            }}
          >
            Share of Wikipedia attention (per billion views)
          </button>
          <button
            type="button"
            onClick={() => setUseNormalized(false)}
            aria-pressed={!useNormalized}
            className="inline-flex items-center justify-center min-h-[36px] rounded-full border px-3 text-[12px]"
            style={{
              borderColor: !useNormalized ? "var(--accent)" : "var(--border)",
              color: !useNormalized ? "var(--text)" : "var(--text-muted)",
              background: !useNormalized ? "var(--bg-card-hover)" : "transparent",
            }}
          >
            Raw views
          </button>
        </div>
        <p className="text-[11.5px] text-[var(--text-dim)]">
          Default divides each value by that month&apos;s trailing 12-month total across all of Wikipedia, so a
          falling line means the team or league itself is losing attention, not that Wikipedia traffic overall is
          shrinking (it is, site-wide, as more searches end without a click-through). &quot;Raw views&quot; turns
          that adjustment off.
        </p>
      </div>

      <section>
        <h2 className="text-base font-semibold text-[var(--text)] mb-1">Compare teams</h2>
        <p className="text-[12.5px] text-[var(--text-muted)] mb-3">
          Pick up to 5 teams to see their attention side by side.
        </p>
        <CompareTeams data={data} useNormalized={useNormalized} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--text)] mb-1">Biggest movers</h2>
        <p className="text-[12.5px] text-[var(--text-muted)] mb-3">
          Which teams in a league gained or lost the most attention share over the last year.
        </p>
        <BiggestMovers data={data} useNormalized={useNormalized} />
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--text)] mb-1">League attention over time</h2>
        <p className="text-[12.5px] text-[var(--text-muted)] mb-3">
          Whole leagues, compared by size, not indexed to a starting point.
        </p>
        <LeagueAttentionOverTime data={data} useNormalized={useNormalized} />
      </section>

      <p className="text-[11px] text-[var(--text-dim)]" style={MONO}>
        {data.months.length} months, {monthLabel(data.months[0])}&ndash;{monthLabel(data.months[data.months.length - 1])}.
        Rolling 12-month all-language Wikipedia attention baseline, not the cross-sport index score. Earlier months
        are hidden: bot traffic inflated Wikipedia views for football pages until June 2024, and 12-month totals
        only became clean from June 2025.
      </p>
    </div>
  );
}
