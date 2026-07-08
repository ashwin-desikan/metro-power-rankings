"use client";

import { useMemo, useState } from "react";

type Row = { slug: string; share: number | null; rank: number | null; tier: string; lat?: number | null; rec?: number | null };
type NamePeriod = { name: string; start: string | null; end: string | null };
type Label = { slug: string; base: string; flag: string | null; hist: NamePeriod[]; href: string | null };
type Data = {
  years: number[];
  byYear: Record<string, Row[]>;
  labels: Record<string, Label>;
  meta: { method: string; sources: string[]; tiers: string[] };
};

const TIERS = ["Superpower", "Great Power", "Middle Power", "Regional", "Minor"];
const TIER_COLOR: Record<string, string> = {
  "Superpower": "#f5c518", "Great Power": "#e8833a", "Middle Power": "#4a9edb", "Regional": "#7a8a99", "Minor": "#464659",
};
const LAT_C = "#8b6fd6", REC_C = "#3ac0a0";
type Lens = "power" | "latent" | "recognized" | "blend";
const LENS_LABEL: Record<Lens, string> = { power: "Power", latent: "Latent", recognized: "Recognised", blend: "Blend" };

function dkey(d: string | null): number {
  if (!d) return -Infinity;
  let s = d, neg = false;
  if (s[0] === "-") { neg = true; s = s.slice(1); }
  const p = s.split("-");
  const v = (parseInt(p[0], 10) || 0) * 10000 + (parseInt(p[1] ?? "1", 10) || 1) * 100 + (parseInt(p[2] ?? "1", 10) || 1);
  return neg ? -v : v;
}
function nameAt(hist: NamePeriod[], year: number, base: string): string {
  const key = year * 10000 + 615;
  for (const p of hist) if ((p.start == null || dkey(p.start) <= key) && (p.end == null || dkey(p.end) >= key)) return p.name;
  return base;
}
function tier(share: number, leader: number): string {
  if (leader <= 0) return "Minor";
  const r = share / leader;
  if (share >= 0.14 && r >= 0.60) return "Superpower";
  if (r >= 0.25) return "Great Power";
  if (r >= 0.10) return "Middle Power";
  if (r >= 0.035) return "Regional";
  return "Minor";
}
const fmtShare = (s: number | null) => (s == null ? "" : `${(s * 100).toFixed(1)}%`);

const MAJORS = ["united-kingdom", "united-states", "china", "russia", "france", "germany", "japan"];
const MAJOR_COLOR: Record<string, string> = {
  "united-kingdom": "#4a9edb", "united-states": "#e0483d", "china": "#f5c518",
  "russia": "#8b6fd6", "france": "#3ac0a0", "germany": "#d98a3a", "japan": "#e368a8",
};

export default function PowerHistory({ data }: { data: Data }) {
  const { years, byYear, labels } = data;
  const minY = years[0] ?? 1789, maxY = years[years.length - 1] ?? 2026;
  const [year, setYear] = useState(maxY);
  const [hover, setHover] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("power");
  const [blendT, setBlendT] = useState(0.5);

  const label = (slug: string) => {
    const l = labels[slug];
    return l ? nameAt(l.hist, year, l.base) : slug;
  };
  const metricOf = useMemo(() => {
    return (r: Row): number | null => {
      if (lens === "power") return r.share;
      if (lens === "latent") return r.lat ?? null;
      if (lens === "recognized") return r.rec ?? null;
      if (r.lat == null || r.rec == null) return null;
      return (1 - blendT) * r.lat + blendT * r.rec;
    };
  }, [lens, blendT]);

  // ranking under the active lens
  const displayRows = useMemo(() => {
    const raw = byYear[String(year)] ?? [];
    if (lens === "power") return raw.map((r) => ({ slug: r.slug, share: r.share, rank: r.rank, tier: r.tier }));
    const scored = raw.map((r) => ({ slug: r.slug, v: metricOf(r) })).filter((x) => x.v != null) as { slug: string; v: number }[];
    scored.sort((a, b) => b.v - a.v);
    const leader = scored[0]?.v ?? 0;
    return scored.map((x, i) => ({ slug: x.slug, share: x.v, rank: i + 1, tier: tier(x.v, leader) }));
  }, [byYear, year, lens, metricOf]);
  const materialUnavailable = lens !== "power" && displayRows.length === 0;
  // Entities active this year with no measured score (unscored present states), oldest first.
  const presentUnranked = useMemo(() => (lens === "power" ? displayRows.filter((r) => r.tier == null) : []), [displayRows, lens]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof displayRows> = {};
    for (const t of TIERS) g[t] = [];
    for (const r of displayRows) (g[r.tier] ?? (g[r.tier] = [])).push(r);
    return g;
  }, [displayRows]);

  // chart (lens metric) for the majors
  const cw = 860, chH = 240, padL = 40, padR = 96, padT = 12, padB = 26;
  const cx0 = lens === "power" ? minY : 1816, cx1 = maxY;
  const maxShare = lens === "power" ? 0.5 : 0.55;
  const px = (y: number) => padL + ((y - cx0) / (cx1 - cx0)) * (cw - padL - padR);
  const py = (s: number) => padT + (1 - s / maxShare) * (chH - padT - padB);
  const series = useMemo(() =>
    MAJORS.map((slug) => {
      const pts: Array<[number, number]> = [];
      for (const y of years) {
        if (y < cx0) continue;
        const rows = byYear[String(y)] ?? [];
        let r = rows.find((x) => x.slug === slug);
        if (!r && slug === "united-kingdom") r = rows.find((x) => x.slug === "england");
        if (!r) continue;
        const v = metricOf(r);
        if (v != null) pts.push([y, v]);
      }
      return { slug, pts };
    }), [years, byYear, metricOf, cx0]);
  const linePath = (pts: Array<[number, number]>) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");

  // divergence (latent vs recognised) for the selected year
  const div = useMemo(() => {
    const raw = (byYear[String(year)] ?? []).filter((r) => r.lat != null && r.rec != null) as Array<Row & { lat: number; rec: number }>;
    if (raw.length < 4) return null;
    const latRank = new Map([...raw].sort((a, b) => b.lat - a.lat).map((r, i) => [r.slug, i + 1] as const));
    const recRank = new Map([...raw].sort((a, b) => b.rec - a.rec).map((r, i) => [r.slug, i + 1] as const));
    const top = [...raw].sort((a, b) => Math.max(b.lat, b.rec) - Math.max(a.lat, a.rec)).slice(0, 18);
    const items = top.map((r) => ({
      slug: r.slug, lat: r.lat, rec: r.rec, lr: latRank.get(r.slug)!, rr: recRank.get(r.slug)!, gap: recRank.get(r.slug)! - latRank.get(r.slug)!,
    }));
    const maxRank = Math.min(30, Math.max(...items.map((x) => Math.max(x.lr, x.rr))));
    const rising = items.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 6);
    const fading = items.filter((x) => x.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 6);
    return { items, maxRank, rising, fading };
  }, [byYear, year]);

  // scatter geometry
  const sW = 360, sH = 360, sPad = 30;
  const rp = (rank: number, R: number) => sPad + ((rank - 1) / Math.max(1, R - 1)) * (sW - 2 * sPad);

  return (
    <div className="space-y-8">
      {/* lens control */}
      <div className="flex flex-wrap items-center gap-2">
        {(["power", "latent", "recognized", "blend"] as Lens[]).map((L) => (
          <button key={L} type="button" onClick={() => setLens(L)}
            className="text-sm px-3 py-1.5 rounded-md border transition-colors"
            style={{
              borderColor: lens === L ? "var(--accent)" : "var(--border)",
              color: lens === L ? "var(--accent)" : "var(--text-muted)",
              background: lens === L ? "var(--bg-card)" : "transparent",
            }}>{LENS_LABEL[L]}</button>
        ))}
        {lens === "blend" && (
          <div className="flex items-center gap-2 ml-1">
            <span className="text-xs" style={{ color: LAT_C, fontFamily: "'JetBrains Mono', monospace" }}>Latent</span>
            <input type="range" min={0} max={100} value={Math.round(blendT * 100)} onChange={(e) => setBlendT(parseInt(e.target.value, 10) / 100)} className="w-40 accent-[var(--accent)]" aria-label="Latent to recognised blend" />
            <span className="text-xs" style={{ color: REC_C, fontFamily: "'JetBrains Mono', monospace" }}>Recognised</span>
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--text-dim)] -mt-4 max-w-3xl">
        {lens === "power" && "The headline hegemony-aware index."}
        {lens === "latent" && "Material mass a state could mobilise: population, manpower, heavy industry, energy."}
        {lens === "recognized" && "What the system treats it as: military spending, productive economy, reach, and status (Security Council seat, nuclear arsenal, bloc leadership)."}
        {lens === "blend" && "Slide between the two lenses to watch the ranking morph from raw material mass to recognised standing."}
      </p>

      {/* year control */}
      <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setYear((y) => Math.max(minY, y - 1))} disabled={year <= minY} aria-label="Previous year" className="text-lg leading-none px-2 py-1 rounded border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>&#9664;</button>
            <div className="text-5xl font-bold tracking-tight tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", minWidth: "4ch", textAlign: "center" }}>{year}</div>
            <button type="button" onClick={() => setYear((y) => Math.min(maxY, y + 1))} disabled={year >= maxY} aria-label="Next year" className="text-lg leading-none px-2 py-1 rounded border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>&#9654;</button>
          </div>
          <div className="text-xs text-[var(--text-muted)]">{year < 1816 ? "Benchmark estimate (pre-industrial data)" : `${LENS_LABEL[lens]} index`}</div>
        </div>
        <input type="range" min={minY} max={maxY} value={year} step={1} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="w-full accent-[var(--accent)]" aria-label="Year" />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[1500, 1600, 1700, 1789, 1830, 1871, 1914, 1945, 1975, 1991, 2000, maxY].map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)}
              className="text-[11px] px-2 py-0.5 rounded border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: year === y ? "var(--accent)" : "var(--border)", color: year === y ? "var(--accent)" : "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{y}</button>
          ))}
        </div>
      </div>

      {materialUnavailable ? (
        <div className="rounded-lg border p-6 text-center text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          The {LENS_LABEL[lens].toLowerCase()} lens is computed from material data that begins in 1816. Pick a later year, or switch to the Power lens for the benchmark-based pre-1816 estimates.
        </div>
      ) : (
        <div className="space-y-5">
          {TIERS.map((t) => {
            const list = grouped[t] ?? [];
            if (!list.length) return null;
            return (
              <div key={t}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIER_COLOR[t] }} />
                  <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: TIER_COLOR[t], fontFamily: "'JetBrains Mono', monospace" }}>{t}</h3>
                  <span className="text-xs text-[var(--text-dim)]">{list.length}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((r) => {
                    const l = labels[r.slug];
                    const nm = label(r.slug);
                    const modern = l && nm === l.base;
                    return (
                      <div key={r.slug} className="flex items-center gap-2.5 rounded px-2.5 py-1.5 border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                        <span className="text-xs text-[var(--text-dim)] w-6 text-right tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.rank ?? "—"}</span>
                        {l?.flag && modern
                          ? <img src={l.flag} alt="" width={20} height={15} className="rounded-sm flex-shrink-0" style={{ objectFit: "cover" }} />
                          : <span className="w-5 text-center text-[var(--text-dim)] flex-shrink-0" aria-hidden>{modern ? "" : "⌛"}</span>}
                        <span className="text-sm flex-1 truncate">
                          {l?.href ? <a href={l.href} className="hover:text-[var(--accent)] transition-colors">{nm}</a> : nm}
                        </span>
                        {r.share != null && (
                          <span className="flex items-center gap-1.5">
                            <span className="hidden sm:inline-block h-1.5 rounded-full" style={{ width: `${Math.max(2, r.share * 160)}px`, background: TIER_COLOR[t], opacity: 0.7 }} />
                            <span className="text-xs text-[var(--text-muted)] tabular-nums w-11 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtShare(r.share)}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {presentUnranked.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--text-dim)" }} />
                <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>Also present</h3>
                <span className="text-xs text-[var(--text-dim)]">{presentUnranked.length}</span>
              </div>
              <p className="text-xs text-[var(--text-dim)] mb-2">States active this year with no measured power score, oldest nation first.</p>
              <div className="flex flex-wrap gap-1.5">
                {presentUnranked.map((r) => {
                  const l = labels[r.slug];
                  const nm = label(r.slug);
                  const modern = l && nm === l.base;
                  return (
                    <span key={r.slug} className="inline-flex items-center gap-1.5 rounded px-2 py-1 border text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                      {l?.flag && modern
                        ? <img src={l.flag} alt="" width={16} height={12} className="rounded-sm flex-shrink-0" style={{ objectFit: "cover" }} />
                        : <span className="text-[var(--text-dim)]" aria-hidden>{modern ? "" : "⌛"}</span>}
                      {l?.href ? <a href={l.href} className="hover:text-[var(--accent)] transition-colors">{nm}</a> : <span>{nm}</span>}
                      <span className="text-[var(--text-dim)]">—</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* share-over-time chart (lens metric) */}
      <div className="rounded-lg border p-4 overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{LENS_LABEL[lens]} share of world power, the major players</h3>
          <span className="text-xs text-[var(--text-dim)]">{cx0} – {maxY}</span>
        </div>
        <svg viewBox={`0 0 ${cw} ${chH}`} className="w-full" style={{ minWidth: 640 }} role="img" aria-label="Share of world power over time">
          {[0.1, 0.2, 0.3, 0.4, 0.5].map((g) => (
            <g key={g}>
              <line x1={padL} y1={py(g)} x2={cw - padR} y2={py(g)} stroke="var(--border)" strokeWidth={0.5} />
              <text x={padL - 5} y={py(g) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">{(g * 100).toFixed(0)}%</text>
            </g>
          ))}
          {(cx0 < 1816 ? [1600, 1700, 1800, 1900, 2000] : [1850, 1900, 1950, 2000]).map((y) => (
            <text key={y} x={px(y)} y={chH - 8} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{y}</text>
          ))}
          <line x1={px(year < cx0 ? cx0 : year)} y1={padT} x2={px(year < cx0 ? cx0 : year)} y2={chH - padB} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          {series.map((s) => (
            <path key={s.slug} d={linePath(s.pts)} fill="none" stroke={MAJOR_COLOR[s.slug]} strokeWidth={hover === s.slug ? 2.6 : 1.5} opacity={hover && hover !== s.slug ? 0.25 : 1} />
          ))}
          {series.map((s) => {
            const last = s.pts[s.pts.length - 1];
            if (!last) return null;
            return <text key={s.slug} x={cw - padR + 4} y={py(last[1]) + 3} fontSize={9} fill={MAJOR_COLOR[s.slug]}>{labels[s.slug]?.base ?? s.slug}</text>;
          })}
        </svg>
        <div className="flex flex-wrap gap-2 mt-2">
          {MAJORS.map((s) => (
            <button key={s} type="button" onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} className="flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded transition-opacity" style={{ opacity: hover && hover !== s ? 0.4 : 1 }}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: MAJOR_COLOR[s] }} />
              <span className="text-[var(--text-muted)]">{labels[s]?.base ?? s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* divergence: latent vs recognised for the selected year */}
      {div && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
            <h3 className="text-sm font-semibold">The recognition gap, {year}</h3>
            <span className="text-xs text-[var(--text-dim)]">who the world under- or over-rates</span>
          </div>
          <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
            <svg viewBox={`0 0 ${sW} ${sH}`} className="w-full max-w-[380px]" role="img" aria-label={`Latent versus recognised rank scatter, ${year}`}>
              <line x1={rp(1, div.maxRank)} y1={rp(1, div.maxRank)} x2={rp(div.maxRank, div.maxRank)} y2={rp(div.maxRank, div.maxRank)} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={sPad} y={14} fontSize={9} fill={REC_C}>← punches above its mass</text>
              <text x={sW - sPad} y={sH - 6} fontSize={9} fill={LAT_C} textAnchor="end">under-recognised ↓</text>
              <text x={4} y={sH / 2} fontSize={8} fill="var(--text-dim)" transform={`rotate(-90 10 ${sH / 2})`}>latent rank →</text>
              <text x={sW / 2} y={sH - 2} fontSize={8} fill="var(--text-dim)" textAnchor="middle">recognised rank →</text>
              {div.items.filter((x) => x.lr <= div.maxRank && x.rr <= div.maxRank).map((x) => {
                const cx = rp(x.rr, div.maxRank), cy = rp(x.lr, div.maxRank);
                const col = x.gap > 1 ? LAT_C : x.gap < -1 ? REC_C : "var(--text-dim)";
                return (
                  <g key={x.slug}>
                    <circle cx={cx} cy={cy} r={3.5} fill={col} />
                    {(Math.abs(x.gap) >= 2 || x.lr <= 6 || x.rr <= 6) && (
                      <text x={cx + 5} y={cy + 3} fontSize={8.5} fill="var(--text-muted)">{labels[x.slug]?.base ?? x.slug}</text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: LAT_C, fontFamily: "'JetBrains Mono', monospace" }}>Under-recognised</h4>
                {div.rising.length ? div.rising.map((x) => (
                  <div key={x.slug} className="flex items-center justify-between text-sm py-0.5">
                    <span className="truncate">{labels[x.slug]?.base ?? x.slug}</span>
                    <span className="text-xs text-[var(--text-dim)] tabular-nums ml-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>latent #{x.lr} · rec #{x.rr}</span>
                  </div>
                )) : <p className="text-xs text-[var(--text-dim)]">None notable.</p>}
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: REC_C, fontFamily: "'JetBrains Mono', monospace" }}>Punching above its mass</h4>
                {div.fading.length ? div.fading.map((x) => (
                  <div key={x.slug} className="flex items-center justify-between text-sm py-0.5">
                    <span className="truncate">{labels[x.slug]?.base ?? x.slug}</span>
                    <span className="text-xs text-[var(--text-dim)] tabular-nums ml-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>latent #{x.lr} · rec #{x.rr}</span>
                  </div>
                )) : <p className="text-xs text-[var(--text-dim)]">None notable.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-3xl">
        {data.meta.method} Tiers are relative to each year&rsquo;s leader. Latent and recognised sub-indices are computed
        from 1816; the Power lens runs from 1500 on benchmark-interpolated estimates with wide error bars.
      </p>
    </div>
  );
}
