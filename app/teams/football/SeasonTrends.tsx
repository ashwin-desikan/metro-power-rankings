"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_COLOR, MUTED, colorForClub } from "./_shared/clubColors";

// Cross-season trends for /teams/football/seasons. Three customisable views over
// every completed season we hold (auto-scales as hub-*.json files are added):
//   • Country coefficients — the 5-year UEFA country race (year-range filter)
//   • Club power ranking — rank trajectory, filter by Top N / country / years
//   • Form vs pedigree — a per-season scatter of why clubs ranked where they did
// Dark-surface palette (site is dark-only); categorical hues are CVD-validated.

type CPoint = { season: string; rank: number; coef: number };
type KPoint = { season: string; rank: number; score: number; form: number; ped: number; tb: number };
export type TrendsData = {
  seasons: string[];
  countrySeasons: string[];
  countries: { country: string; series: CPoint[]; latestRank: number }[];
  clubs: { name: string; country: string | null; lookup?: string | null; best: number; series: KPoint[] }[];
};

// Club + country colours live in ./_shared/clubColors (shared with SeasonSuperlatives).
// "2016-17" -> "16/17"
const ss = (s: string) => (s.length >= 7 ? `${s.slice(2, 4)}/${s.slice(5, 7)}` : s);
// Which season labels to print on a season x-axis, so a long range doesn't crowd. Every data point
// still renders; only the tick text is thinned. Prefer half-decade seasons (end year divisible by 5:
// 99/00, 04/05, 09/10 …); if even those are too many, fall back to decade only (…/00, …/10); if the
// visible range is so short it yields none, just label them all (it's short enough not to crowd).
const endYear = (s: string) => parseInt(s.slice(0, 4), 10) + 1;
function axisTicks(view: string[], cap = 12): Set<string> {
  const half = view.filter((s) => endYear(s) % 5 === 0);
  if (half.length > cap) return new Set(view.filter((s) => endYear(s) % 10 === 0));
  if (half.length === 0) return new Set(view);
  return new Set(half);
}

// Physical readability on phones: these charts draw on a 760-wide viewBox, so
// on a ~380px screen every 9px label scales to ~4.5px and the wide right-side
// label gutters waste a fifth of the width. Below 640px we re-lay the SAME
// chart on a 400-wide viewBox — bigger physical type, slim gutters, legends
// instead of line-end labels, thinner ticks — rather than shrinking the
// desktop drawing (Ashwin 2026-08-02).
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const selCls = "text-xs px-2 py-1 rounded-md border bg-transparent";
const selStyle = { borderColor: "var(--border)", color: "var(--text)" } as const;

function RangeSelect({ labels, fromI, toI, setFrom, setTo }: {
  labels: string[]; fromI: number; toI: number; setFrom: (n: number) => void; setTo: (n: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
      <select className={selCls} style={selStyle} value={fromI} onChange={(e) => setFrom(Math.min(+e.target.value, toI))}>
        {labels.map((s, i) => <option key={s} value={i} style={{ background: "var(--bg-card)" }}>{ss(s)}</option>)}
      </select>
      <span>→</span>
      <select className={selCls} style={selStyle} value={toI} onChange={(e) => setTo(Math.max(+e.target.value, fromI))}>
        {labels.map((s, i) => <option key={s} value={i} style={{ background: "var(--bg-card)" }}>{ss(s)}</option>)}
      </select>
    </span>
  );
}

export default function SeasonTrends({ data }: { data: TrendsData }) {
  const [tab, setTab] = useState<"country" | "club" | "scatter">("country");
  const tabs: { key: typeof tab; label: string }[] = [
    { key: "country", label: "Country race" },
    { key: "club", label: "Club power ranking" },
    { key: "scatter", label: "Form vs pedigree" },
  ];
  return (
    <section className="rounded-xl border p-4 mb-6" style={cardStyle}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-lg font-semibold">Trends across seasons</h2>
        <div className="flex gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors"
              style={{ background: "var(--bg-card)", color: tab === t.key ? "var(--accent)" : "var(--text-muted)", borderColor: tab === t.key ? "var(--accent)" : "var(--border)", fontWeight: tab === t.key ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "country" && <CountryChart data={data} />}
      {tab === "club" && <ClubChart data={data} />}
      {tab === "scatter" && <ScatterChart data={data} />}
    </section>
  );
}

/* ---------------- Country coefficient race ---------------- */
function CountryChart({ data }: { data: TrendsData }) {
  const labels = data.countrySeasons;
  const [fromI, setFromI] = useState(0);
  const [toI, setToI] = useState(labels.length - 1);
  const view = labels.slice(fromI, toI + 1);
  const narrow = useIsNarrow();
  const W = narrow ? 400 : 760, H = narrow ? 240 : 260, PL = narrow ? 26 : 30, PR = narrow ? 12 : 100, PT = 12, PB = 22;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hi, setHi] = useState<string | null>(null);
  const denom = Math.max(1, view.length - 1);
  const px = (s: string) => PL + (view.indexOf(s) / denom) * (W - PL - PR);
  const yMax = 130;
  const py = (v: number) => PT + (1 - v / yMax) * (H - PT - PB);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const xv = ((e.clientX - r.left) / r.width) * W;
    let best = view[0], bd = Infinity;
    for (const s of view) { const d = Math.abs(px(s) - xv); if (d < bd) { bd = d; best = s; } }
    setHi(best);
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <p className="text-xs text-[var(--text-muted)] max-w-xl">Five-year UEFA country coefficient. England overtook Spain in {ss("2021-22")} and pulled clear; Italy climbed back to second; Russia drops out after {ss("2021-22")}.</p>
        <RangeSelect labels={labels} fromI={fromI} toI={toI} setFrom={setFromI} setTo={setToI} />
      </div>
      <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap text-xs mb-1" style={{ minHeight: "1.25rem" }}>
        {hi ? (
          <>
            <span className="font-bold tabular-nums text-[var(--text)]">{ss(hi)}</span>
            {data.countries.map((c) => {
              const p = c.series.find((s) => s.season === hi);
              if (!p) return null;
              return (
                <span key={c.country} className="flex items-center gap-1 text-[var(--text-muted)]">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: COUNTRY_COLOR[c.country] ?? MUTED }} />
                  {c.country} <span className="tabular-nums font-semibold text-[var(--text)]">{p.coef.toFixed(1)}</span>
                </span>
              );
            })}
          </>
        ) : <span className="text-[var(--text-dim)]">Hover for each season’s exact coefficients</span>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {[25, 50, 75, 100, 125].map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{t}</text>
          </g>
        ))}
        {(() => { const ticks = axisTicks(view, narrow ? 6 : 12); return view.filter((s) => ticks.has(s)).map((s) => <text key={s} x={px(s)} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{ss(s)}</text>); })()}
        {hi && <line x1={px(hi)} x2={px(hi)} y1={PT} y2={H - PB} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />}
        {data.countries.map((c) => {
          const col = COUNTRY_COLOR[c.country] ?? MUTED;
          const psv = c.series.filter((p) => view.includes(p.season));
          if (!psv.length) return null;
          const last = psv[psv.length - 1];
          return (
            <g key={c.country}>
              <polyline fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" points={psv.map((p) => `${px(p.season)},${py(p.coef)}`).join(" ")} />
              {psv.map((p) => <circle key={p.season} cx={px(p.season)} cy={py(p.coef)} r={hi === p.season ? 4 : 2.5} fill={col} stroke="var(--bg-card)" strokeWidth={1.2} />)}
              {!narrow && <text x={px(last.season) + 6} y={py(last.coef) + 3} fontSize={9.5} fill={col}>{c.country}</text>}
            </g>
          );
        })}
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="transparent" />
      </svg>
      {narrow && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {data.countries.map((c) => (
            <span key={c.country} className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: COUNTRY_COLOR[c.country] ?? MUTED }} />
              {c.country}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Club power ranking — interactive multi-club chart ---------------- */
type Metric = "rank" | "form" | "ped" | "tb";
const CLUB_METRICS: { key: Metric; label: string }[] = [
  { key: "rank", label: "Rank" }, { key: "form", label: "Form" },
  { key: "ped", label: "Pedigree" }, { key: "tb", label: "Trophy" },
];
const metricVal = (p: KPoint, m: Metric): number =>
  m === "rank" ? p.rank : m === "form" ? p.form : m === "ped" ? p.ped : p.tb;

function ClubChart({ data }: { data: TrendsData }) {
  const seasons = data.seasons;
  const countries = useMemo(
    () => ["All", ...Array.from(new Set(data.clubs.map((c) => c.country).filter(Boolean) as string[])).sort()],
    [data]);
  const allClubs = useMemo(() => [...data.clubs.map((c) => c.name)].sort((a, b) => a.localeCompare(b)), [data]);

  const [metric, setMetric] = useState<Metric>("rank");
  const [topN, setTopN] = useState(10);
  const [ctry, setCtry] = useState("All");
  const [fromI, setFromI] = useState(0);
  const [toI, setToI] = useState(seasons.length - 1);
  const [pinned, setPinned] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [hi, setHi] = useState<string | null>(null);

  // Shareable URL state: read once on mount, then mirror changes with replaceState (no router dep,
  // so no Suspense boundary needed). Defaults render identically on server + client to avoid a
  // hydration mismatch; the URL is applied after mount.
  const ready = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("m"); if (m && ["rank", "form", "ped", "tb"].includes(m)) setMetric(m as Metric);
    const n = q.get("n"); if (n && [5, 10, 15, 20].includes(+n)) setTopN(+n);
    const c = q.get("c"); if (c) setCtry(c);
    const f = q.get("f"); if (f && +f >= 0 && +f < seasons.length) setFromI(+f);
    const t = q.get("t"); if (t && +t >= 0 && +t < seasons.length) setToI(+t);
    const cl = q.get("clubs"); if (cl) setPinned(cl.split("~").filter((x) => data.clubs.some((d) => d.name === x)));
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    const q = new URLSearchParams(window.location.search);
    if (metric === "rank") q.delete("m"); else q.set("m", metric);
    if (topN === 10) q.delete("n"); else q.set("n", String(topN));
    if (ctry === "All") q.delete("c"); else q.set("c", ctry);
    if (fromI === 0) q.delete("f"); else q.set("f", String(fromI));
    if (toI === seasons.length - 1) q.delete("t"); else q.set("t", String(toI));
    if (pinned.length) q.set("clubs", pinned.join("~")); else q.delete("clubs");
    const qs = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`);
  }, [metric, topN, ctry, fromI, toI, pinned, seasons.length]);

  const view = seasons.slice(fromI, toI + 1);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  // Visible clubs = country-filtered clubs that are pinned OR make the Top N by the current metric
  // within the visible range. Pinned clubs are always traced, even outside the Top N.
  const vis = useMemo(() => {
    const scoped = data.clubs
      .filter((c) => ctry === "All" || c.country === ctry)
      .map((c) => ({ name: c.name, country: c.country, pts: c.series.filter((p) => view.includes(p.season)) }))
      .filter((c) => c.pts.length > 0);
    const peak = (pts: KPoint[]) => metric === "rank"
      ? Math.min(...pts.map((p) => p.rank))
      : Math.max(...pts.map((p) => metricVal(p, metric)));
    let picked: typeof scoped;
    if (metric === "rank") {
      picked = scoped.filter((c) => pinnedSet.has(c.name) || c.pts.some((p) => p.rank <= topN));
    } else {
      const ranked = [...scoped].sort((a, b) => peak(b.pts) - peak(a.pts));
      const top = new Set(ranked.slice(0, topN).map((c) => c.name));
      picked = scoped.filter((c) => pinnedSet.has(c.name) || top.has(c.name));
    }
    return picked
      .map((c) => ({ ...c, key: peak(c.pts) }))
      .sort((a, b) => (metric === "rank" ? a.key - b.key : b.key - a.key));
  }, [data, ctry, topN, view, metric, pinnedSet]);

  const drawn = vis.filter((c) => !hiddenSet.has(c.name));

  const narrow = useIsNarrow();
  const W = narrow ? 400 : 760, PL = narrow ? 26 : 30, PR = narrow ? 16 : 150, PT = 12, PB = 22;
  const isRank = metric === "rank";
  const H = isRank ? Math.max(220, topN * 16 + 40) : 260;
  const denom = Math.max(1, view.length - 1);
  const px = (s: string) => PL + (view.indexOf(s) / denom) * (W - PL - PR);
  const maxVal = isRank ? 0 : Math.max(0.0001, ...drawn.flatMap((c) => c.pts.map((p) => metricVal(p, metric))));
  const py = (v: number) => isRank
    ? PT + ((v - 1) / Math.max(1, topN - 1)) * (H - PT - PB)
    : PT + (1 - v / maxVal) * (H - PT - PB);
  const yTicks: { v: number; label: string }[] = isRank
    ? (() => { const t = [1, 5, 10, 15, 20].filter((r) => r <= topN); if (!t.includes(topN)) t.push(topN); return t.map((r) => ({ v: r, label: String(r) })); })()
    : [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: f * maxVal, label: (f * maxVal).toFixed(2) }));

  const addClub = (name: string) => { if (name && !pinnedSet.has(name)) setPinned([...pinned, name]); };
  const removeClub = (name: string) => setPinned(pinned.filter((n) => n !== name));
  const toggleHidden = (name: string) => setHidden(hiddenSet.has(name) ? hidden.filter((n) => n !== name) : [...hidden, name]);

  const metricNote = isRank
    ? "Finishing position in the club power ranking each season (1 = top). Rank is comparable across the 2018 coefficient-method change; the raw score is not."
    : metric === "form" ? "Earned form (opponent- and stage-weighted results) each season, scaled 0-1 within that year."
    : metric === "ped" ? "Five-year UEFA pedigree each season, scaled 0-1 within that year."
    : "Trophy bonus earned each season, from league, continental and cup honours.";

  return (
    <div>
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <p className="text-xs text-[var(--text-muted)] max-w-sm">{metricNote} Hover to isolate a club; click a line to pin it across every season; use the legend to hide a series.</p>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {CLUB_METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} className="text-xs px-2 py-1 transition-colors"
                style={{ background: metric === m.key ? "var(--accent)" : "transparent", color: metric === m.key ? "#fff" : "var(--text-muted)" }}>
                {m.label}
              </button>
            ))}
          </div>
          <select className={selCls} style={selStyle} value={topN} onChange={(e) => setTopN(+e.target.value)}>
            {[5, 10, 15, 20].map((n) => <option key={n} value={n} style={{ background: "var(--bg-card)" }}>Top {n}</option>)}
          </select>
          <select className={selCls} style={selStyle} value={ctry} onChange={(e) => setCtry(e.target.value)}>
            {countries.map((c) => <option key={c} value={c} style={{ background: "var(--bg-card)" }}>{c === "All" ? "All countries" : c}</option>)}
          </select>
          <RangeSelect labels={seasons} fromI={fromI} toI={toI} setFrom={setFromI} setTo={setToI} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <select className={selCls} style={selStyle} value="" onChange={(e) => { addClub(e.target.value); e.currentTarget.value = ""; }}>
          <option value="" style={{ background: "var(--bg-card)" }}>+ Add club…</option>
          {allClubs.filter((n) => !pinnedSet.has(n)).map((n) => <option key={n} value={n} style={{ background: "var(--bg-card)" }}>{n}</option>)}
        </select>
        {pinned.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 text-xs rounded-full border pl-1.5 pr-1 py-0.5" style={{ borderColor: colorForClub(n), color: "var(--text)" }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorForClub(n) }} />
            {n}
            <button onClick={() => removeClub(n)} className="ml-0.5 text-[var(--text-dim)] hover:text-[var(--text)]" aria-label={`Remove ${n}`}>×</button>
          </span>
        ))}
        <button onClick={() => setShowLabels((v) => !v)} className="text-xs px-2 py-0.5 rounded-md border"
          style={{ borderColor: "var(--border)", color: showLabels ? "var(--accent)" : "var(--text-muted)" }}>
          {showLabels ? "Labels on" : "Labels off"}
        </button>
      </div>

      {drawn.length === 0 ? (
        <p className="text-xs text-[var(--text-dim)] py-8 text-center">Nothing to show for this filter{ctry !== "All" ? ` (${ctry})` : ""}. Widen the Top N, clear the country filter, or pin a club.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setHi(null)}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={py(t.v)} y2={py(t.v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PL - 4} y={py(t.v) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{t.label}</text>
            </g>
          ))}
          {(() => { const xt = axisTicks(view, narrow ? 6 : 12); return view.filter((s) => xt.has(s)).map((s) => <text key={s} x={px(s)} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{ss(s)}</text>); })()}
          {drawn.map((c) => {
            const on = hi === c.name;
            const faded = hi != null && !on;
            const col = colorForClub(c.name);
            const ordered = [...c.pts].sort((a, b) => view.indexOf(a.season) - view.indexOf(b.season));
            const last = ordered[ordered.length - 1];
            // Only connect points in consecutive seasons; a skipped season ends the line.
            const segs: KPoint[][] = [];
            for (const p of ordered) {
              const prev = segs[segs.length - 1];
              if (prev && view.indexOf(p.season) === view.indexOf(prev[prev.length - 1].season) + 1) prev.push(p);
              else segs.push([p]);
            }
            return (
              <g key={c.name} opacity={faded ? 0.16 : 1} onMouseEnter={() => setHi(c.name)}
                onClick={() => (pinnedSet.has(c.name) ? removeClub(c.name) : addClub(c.name))} style={{ cursor: "pointer" }}>
                {segs.map((seg, si) => seg.length > 1 ? (
                  <polyline key={si} fill="none" stroke={col} strokeWidth={on ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" points={seg.map((p) => `${px(p.season)},${py(metricVal(p, metric))}`).join(" ")} />
                ) : null)}
                {ordered.map((p) => <circle key={p.season} cx={px(p.season)} cy={py(metricVal(p, metric))} r={on ? 4 : 2.6} fill={col} stroke="var(--bg-card)" strokeWidth={1.2} />)}
                {showLabels && !narrow && <text x={px(last.season) + 6} y={py(metricVal(last, metric)) + 3} fontSize={9.5} fill={faded ? "var(--text-dim)" : col} fontWeight={on ? 700 : 400}>{c.name}{pinnedSet.has(c.name) ? " •" : ""}</text>}
              </g>
            );
          })}
        </svg>
      )}

      {vis.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {vis.map((c) => {
            const off = hiddenSet.has(c.name);
            return (
              <button key={c.name} onClick={() => toggleHidden(c.name)} onMouseEnter={() => setHi(c.name)} onMouseLeave={() => setHi(null)}
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: off ? "var(--text-dim)" : "var(--text-muted)", textDecoration: off ? "line-through" : "none" }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: off ? "var(--text-dim)" : colorForClub(c.name) }} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Form vs pedigree scatter ---------------- */
function ScatterChart({ data }: { data: TrendsData }) {
  const seasons = data.seasons;
  const countries = useMemo(
    () => ["All", ...Array.from(new Set(data.clubs.map((c) => c.country).filter(Boolean) as string[])).sort()],
    [data]);
  const [sel, setSel] = useState(seasons[seasons.length - 1]);
  const [ctry, setCtry] = useState("All");
  const narrow = useIsNarrow();
  const W = narrow ? 400 : 760, H = narrow ? 300 : 330, PL = narrow ? 34 : 40, PR = narrow ? 10 : 16, PT = 14, PB = 34;
  const px = (v: number) => PL + v * (W - PL - PR);
  const py = (v: number) => PT + (1 - v) * (H - PT - PB);
  const pts = useMemo(() =>
    data.clubs
      .filter((c) => ctry === "All" || c.country === ctry)
      .map((c) => ({ name: c.name, p: c.series.find((s) => s.season === sel) }))
      .filter((x): x is { name: string; p: KPoint } => x.p != null)
      .sort((a, b) => a.p.rank - b.p.rank), [data, sel, ctry]);
  const [hi, setHi] = useState<string | null>(null);
  const rOf = (tb: number) => 4 + Math.min(tb, 0.25) * 34;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <p className="text-xs text-[var(--text-muted)] max-w-lg">Each club’s season by earned form (this year’s results) versus five-year pedigree; bubble size is the trophy bonus. Top-right earned it and had the pedigree; bottom-right lived on reputation; top-left overachieved.</p>
        <div className="flex items-center gap-1.5">
          <select className={selCls} style={selStyle} value={ctry} onChange={(e) => setCtry(e.target.value)}>
            {countries.map((c) => <option key={c} value={c} style={{ background: "var(--bg-card)" }}>{c === "All" ? "All countries" : c}</option>)}
          </select>
          <select className={selCls} style={selStyle} value={sel} onChange={(e) => setSel(e.target.value)}>
            {[...seasons].reverse().map((s) => <option key={s} value={s} style={{ background: "var(--bg-card)" }}>{s}</option>)}
          </select>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setHi(null)}>
        <line x1={px(0.5)} x2={px(0.5)} y1={PT} y2={H - PB} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={PL} x2={W - PR} y1={py(0.5)} y2={py(0.5)} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <text x={px(t)} y={H - 20} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{t.toFixed(2)}</text>
            <text x={PL - 6} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{t.toFixed(2)}</text>
          </g>
        ))}
        <text x={(PL + W - PR) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-muted)">Five-year pedigree →</text>
        <text x={12} y={(PT + H - PB) / 2} textAnchor="middle" fontSize={10} fill="var(--text-muted)" transform={`rotate(-90 12 ${(PT + H - PB) / 2})`}>Form this season →</text>
        {pts.map(({ name, p }) => {
          const on = hi === name;
          const show = p.rank <= (narrow ? 2 : 4) || on;
          return (
            <g key={name} onMouseEnter={() => setHi(name)} style={{ cursor: "pointer" }}>
              <circle cx={px(p.ped)} cy={py(p.form)} r={rOf(p.tb)} fill="var(--accent)" fillOpacity={on ? 0.5 : 0.22} stroke="var(--accent)" strokeWidth={on ? 2 : 1} />
              {show && <text x={px(p.ped)} y={py(p.form) - rOf(p.tb) - 3} textAnchor="middle" fontSize={9.5} fill="var(--text)" fontWeight={on ? 700 : 500}>{name}</text>}
            </g>
          );
        })}
      </svg>
      {hi && (() => {
        const r = pts.find((x) => x.name === hi);
        if (!r) return null;
        return <div className="text-xs text-[var(--text-muted)] mt-1"><span className="font-semibold text-[var(--text)]">{hi}</span> — rank {r.p.rank}, form {r.p.form.toFixed(2)}, pedigree {r.p.ped.toFixed(2)}, trophy bonus {r.p.tb.toFixed(2)}</div>;
      })()}
    </div>
  );
}
