"use client";

import { useMemo, useRef, useState } from "react";

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

const COUNTRY_COLOR: Record<string, string> = {
  England: "#3987e5", Spain: "#e66767", Italy: "#199e70", Germany: "#c98500",
  France: "#9085e9", Portugal: "#d55181", Netherlands: "#d95926", Russia: "#8888A0",
};
// Club primary (brand) colours, adjusted for the dark surface. Where brands
// collide (the many reds), the direct labels and hover-isolation carry identity.
const CLUB_COLOR: Record<string, string> = {
  "Real Madrid": "#E6E6EC", "FC Barcelona": "#C4194F", "Bayern Munich": "#E8253F",
  "Paris Saint-Germain": "#3A78C0", "Manchester City": "#6CABDD", "Liverpool": "#E23048",
  "Juventus": "#C9C9D2", "Atlético de Madrid": "#E0463A", "Chelsea": "#2A6FC9",
  "Arsenal": "#F03A46", "Internazionale": "#1E90D8", "SSC Napoli": "#29B3E6",
  "Bayer Leverkusen": "#EE4A44", "Manchester United": "#E83A44", "Aston Villa": "#A83A63",
  "Borussia Dortmund": "#F5D400", "Sevilla FC": "#E84A50", "Benfica": "#E83A3A",
  "FC Porto": "#2E6BE0", "Atalanta": "#2E88D0", "AS Roma": "#C24354", "Ajax": "#E63A50",
  "RB Leipzig": "#E83A66", "Tottenham Hotspur": "#6E7CB0", "Villarreal": "#EDD24D",
  "AS Monaco": "#EE4A4F", "Sporting Clube de Portugal": "#16A06E", "FC Shakhtar Donetsk": "#F79A3A",
  "PSV Eindhoven": "#F04A50", "AC Milan": "#ED3236", "Eintracht Frankfurt": "#E8404A",
  "Olympique Lyonnais": "#2C6BD6", "Lazio": "#7BC7EE", "Valencia": "#F08A1E",
  "FC Schalke 04": "#2E6BC0", "FC Red Bull Salzburg": "#E84048", "Zenit St. Petersburg": "#2E9AD6",
};
const MUTED = "#55556A";
// "2016-17" -> "16/17"
const ss = (s: string) => (s.length >= 7 ? `${s.slice(2, 4)}/${s.slice(5, 7)}` : s);
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
  const W = 760, H = 260, PL = 30, PR = 100, PT = 12, PB = 22;
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
        {view.map((s) => <text key={s} x={px(s)} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{ss(s)}</text>)}
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
              <text x={px(last.season) + 6} y={py(last.coef) + 3} fontSize={9.5} fill={col}>{c.country}</text>
            </g>
          );
        })}
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="transparent" />
      </svg>
    </div>
  );
}

/* ---------------- Club power-ranking bump chart ---------------- */
function ClubChart({ data }: { data: TrendsData }) {
  const seasons = data.seasons;
  const countries = useMemo(
    () => ["All", ...Array.from(new Set(data.clubs.map((c) => c.country).filter(Boolean) as string[])).sort()],
    [data]);
  const [topN, setTopN] = useState(10);
  const [ctry, setCtry] = useState("All");
  const [fromI, setFromI] = useState(0);
  const [toI, setToI] = useState(seasons.length - 1);
  const [hi, setHi] = useState<string | null>(null);
  const view = seasons.slice(fromI, toI + 1);

  const vis = useMemo(() => {
    return data.clubs
      .filter((c) => ctry === "All" || c.country === ctry)
      .map((c) => {
        const pts = c.series.filter((p) => view.includes(p.season) && p.rank <= topN);
        const best = Math.min(...pts.map((p) => p.rank), 999);
        return { name: c.name, country: c.country, pts, best };
      })
      .filter((c) => c.pts.length > 0 && c.best <= topN)
      .sort((a, b) => a.best - b.best);
  }, [data, ctry, topN, view]);

  const W = 760, H = Math.max(220, topN * 16 + 40), PL = 26, PR = 150, PT = 12, PB = 22;
  const denom = Math.max(1, view.length - 1);
  const px = (s: string) => PL + (view.indexOf(s) / denom) * (W - PL - PR);
  const py = (r: number) => PT + ((r - 1) / Math.max(1, topN - 1)) * (H - PT - PB);
  const colorOf = (name: string) => CLUB_COLOR[name] ?? MUTED;
  const ticks = [1, 5, 10, 15, 20].filter((r) => r <= topN);
  if (!ticks.includes(topN)) ticks.push(topN);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <p className="text-xs text-[var(--text-muted)] max-w-md">Finishing position in the club power ranking each season (1 = top). Rank is comparable across the 2018 coefficient-method change; the raw score is not. Hover a club to trace it.</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select className={selCls} style={selStyle} value={topN} onChange={(e) => setTopN(+e.target.value)}>
            {[5, 10, 15, 20].map((n) => <option key={n} value={n} style={{ background: "var(--bg-card)" }}>Top {n}</option>)}
          </select>
          <select className={selCls} style={selStyle} value={ctry} onChange={(e) => setCtry(e.target.value)}>
            {countries.map((c) => <option key={c} value={c} style={{ background: "var(--bg-card)" }}>{c === "All" ? "All countries" : c}</option>)}
          </select>
          <RangeSelect labels={seasons} fromI={fromI} toI={toI} setFrom={setFromI} setTo={setToI} />
        </div>
      </div>
      {vis.length === 0 ? (
        <p className="text-xs text-[var(--text-dim)] py-8 text-center">No clubs reached the Top {topN} in this range{ctry !== "All" ? ` for ${ctry}` : ""}.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setHi(null)}>
          {ticks.map((r) => (
            <g key={r}>
              <line x1={PL} x2={W - PR} y1={py(r)} y2={py(r)} stroke="var(--border)" strokeWidth={1} />
              <text x={PL - 4} y={py(r) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{r}</text>
            </g>
          ))}
          {view.map((s) => <text key={s} x={px(s)} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{ss(s)}</text>)}
          {vis.map((c) => {
            const on = hi === c.name;
            const faded = hi != null && !on;
            const col = colorOf(c.name);
            const last = c.pts[c.pts.length - 1];
            return (
              <g key={c.name} opacity={faded ? 0.16 : 1} onMouseEnter={() => setHi(c.name)} style={{ cursor: "pointer" }}>
                <polyline fill="none" stroke={col} strokeWidth={on ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" points={c.pts.map((p) => `${px(p.season)},${py(p.rank)}`).join(" ")} />
                {c.pts.map((p) => <circle key={p.season} cx={px(p.season)} cy={py(p.rank)} r={on ? 4 : 2.6} fill={col} stroke="var(--bg-card)" strokeWidth={1.2} />)}
                <text x={px(last.season) + 6} y={py(last.rank) + 3} fontSize={9.5} fill={faded ? "var(--text-dim)" : col} fontWeight={on ? 700 : 400}>{c.name}</text>
              </g>
            );
          })}
        </svg>
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
  const W = 760, H = 330, PL = 40, PR = 16, PT = 14, PB = 34;
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
          const show = p.rank <= 4 || on;
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
