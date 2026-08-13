"use client";

import { useMemo, useState } from "react";
import { makeDeflator, deflateSeries, type MarketCpi } from "@/lib/realTerms";

// Rebased overlay for /business/markets/compare.
//
// THE WHOLE POINT IS THE REBASE. Index levels are not comparable: the Nikkei is
// tens of thousands, the FTSE is five figures, copper is under five dollars.
// Every selected series is therefore indexed to 100 at a chosen date, so the
// chart answers "what would this have done to your money from here" rather
// than "which number is bigger".
//
// A series with no data at the rebase date is EXCLUDED, not spliced in at its
// own first point. Starting each line at 100 on a different date would put two
// lines side by side that are measuring different periods, which is exactly the
// misreading a rebased chart invites. The picker greys those out and says when
// they start, which is honest and also tells the reader something real about
// data coverage.
//
// REAL TERMS. Rebasing removes the level problem but not the currency problem:
// a Brazilian index rebased to 100 in 1994 looks superhuman next to the S&P
// because it is measured in a currency that lost most of its value over the
// same window. The Real toggle deflates each series by the CPI of ITS OWN
// country before rebasing, which turns the chart into a comparison of what a
// domestic investor's purchasing power actually did. Currencies drop out when
// it is on: an exchange rate is a ratio between two monies and has no single
// deflator, so there is nothing honest to show.
//
// Data: public/data/business/markets-overlay.json - month-end observations for
// all 40 series (13 indices, 6 commodities, bitcoin, 20 currencies).

const KINDS = ["index", "commodity", "crypto", "fx"] as const;
export type OverlayKind = (typeof KINDS)[number];

export type OverlaySeries = {
  slug: string;
  kind: OverlayKind;
  name: string;
  unit: string | null;
  start: string;
  series: [string, number][];
  cpi?: MarketCpi | null;
};

// Same categorical palette as app/elections/forecast, for consistency across
// the site's multi-series charts.
const PALETTE = [
  "#1E5EBE", "#0FA88F", "#7C3AED", "#E11D48", "#0284C7", "#CA8A04", "#334155",
  "#059669", "#9333EA", "#DC2626", "#2563EB", "#64748B", "#D97706", "#4B5563",
];

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const STARTS = ["1900-01-01", "1950-01-01", "1970-01-01", "1990-01-01", "2000-01-01", "2010-01-01", "2020-01-01"];
const KIND_LABEL: Record<OverlayKind, string> = {
  index: "Indices", commodity: "Commodities", crypto: "Crypto", fx: "Currencies",
};
const MAX_PICKS = 8;

function fmt(n: number): string {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(0);
  return n.toFixed(1);
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out.slice(0, 8);
}

export default function CompareChart({ all }: { all: OverlaySeries[] }) {
  const [from, setFrom] = useState("1990-01-01");
  const [picked, setPicked] = useState<string[]>(["sp-500", "nikkei-225", "ftse-100", "gold"]);
  const [log, setLog] = useState(true);
  const [real, setReal] = useState(false);

  // Deflate BEFORE rebasing, and let the real series carry its own start: the
  // CPI record can begin later than the price record (the Dow's prices run from
  // 1885, US CPI from 1913), and a real line must not be drawn over years it
  // cannot actually deflate.
  const prepared = useMemo(() => {
    const map = new Map<string, { series: [string, number][]; start: string; baseYear: number | null }>();
    for (const s of all) {
      if (!real) {
        map.set(s.slug, { series: s.series, start: s.start, baseYear: null });
        continue;
      }
      const d = makeDeflator(s.cpi);
      if (!d) continue;
      const ser = deflateSeries(s.series, d);
      if (ser.length < 2) continue;
      map.set(s.slug, { series: ser, start: ser[0][0], baseYear: d.baseYear });
    }
    return map;
  }, [all, real]);

  const eligible = useMemo(() => {
    const out = new Set<string>();
    for (const [slug, p] of prepared) if (p.start <= from) out.add(slug);
    return out;
  }, [prepared, from]);

  const lines = useMemo(() => {
    const out: { slug: string; name: string; color: string; pts: [number, number][]; last: number }[] = [];
    let ci = 0;
    for (const slug of picked) {
      const s = all.find((x) => x.slug === slug);
      const p = prepared.get(slug);
      if (!s || !p || !eligible.has(slug)) continue;
      const window = p.series.filter(([d]) => d >= from);
      if (window.length < 2 || window[0][1] <= 0) continue;
      const base = window[0][1];
      const pts = window.map(([d, v]) => [Date.parse(`${d}T00:00:00Z`), (v / base) * 100] as [number, number]);
      out.push({ slug, name: s.name, color: PALETTE[ci++ % PALETTE.length], pts, last: pts[pts.length - 1][1] });
    }
    return out;
  }, [all, picked, from, eligible, prepared]);

  const byKind = useMemo(() => {
    const g: Record<string, OverlaySeries[]> = Object.fromEntries(KINDS.map((k) => [k, []]));
    for (const s of all) g[s.kind]?.push(s);
    return g;
  }, [all]);

  function toggle(slug: string) {
    setPicked((p) =>
      p.includes(slug) ? p.filter((x) => x !== slug) : p.length >= MAX_PICKS ? p : [...p, slug],
    );
  }

  const W = 720, H = 340, PL = 54, PR = 96, PT = 14, PB = 26;
  const allPts = lines.flatMap((l) => l.pts);
  const hasData = lines.length > 0 && allPts.length > 1;

  let body = null;
  if (!hasData) {
    body = (
      <p className="text-sm text-[var(--text-muted)] py-10 text-center">
        Nothing to draw. Pick at least one series that already existed in {from.slice(0, 4)}.
      </p>
    );
  } else {
    const ys = allPts.map((p) => p[1]);
    const lo = Math.max(Math.min(...ys), log ? 0.01 : -Infinity);
    const hi = Math.max(...ys);
    const y0 = log ? Math.log10(lo) - 0.03 : lo - (hi - lo) * 0.06;
    const y1 = log ? Math.log10(hi) + 0.03 : hi + (hi - lo) * 0.06;
    const ts = allPts.map((p) => p[0]);
    const t0 = Math.min(...ts), tSpan = Math.max(...ts) - t0 || 1;
    const px = (t: number) => PL + ((t - t0) / tSpan) * (W - PL - PR);
    const py = (v: number) => {
      const u = log ? Math.log10(Math.max(v, 1e-9)) : v;
      return PT + (1 - (u - y0) / (y1 - y0)) * (H - PT - PB);
    };
    const ticks = log ? logTicks(lo, hi) : [lo, (lo + hi) / 2, hi];
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      f, label: new Date(t0 + f * tSpan).toISOString().slice(0, 4),
    }));

    body = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`Selected markets rebased to 100 at ${from}`}>
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* the rebase line: everything starts here, so it deserves emphasis */}
        {100 >= Math.min(...ys) && 100 <= hi && (
          <line x1={PL} x2={W - PR} y1={py(100)} y2={py(100)}
                stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="4 3" />
        )}
        {xTicks.map((t, k) => (
          <text key={`x${k}`} x={PL + t.f * (W - PL - PR)} y={H - 8}
                textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}
                fontSize={9} fill="var(--text-dim)" style={MONO}>
            {t.label}
          </text>
        ))}
        {lines.map((l) => (
          <g key={l.slug}>
            <path
              d={l.pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join("")}
              fill="none" stroke={l.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"
            />
            <text x={W - PR + 5} y={py(l.last) + 3} fontSize={9} fill={l.color} style={MONO}>
              {fmt(l.last)}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <label className="text-xs text-[var(--text-muted)]">
          Rebase to 100 at{" "}
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          >
            {STARTS.map((d) => (
              <option key={d} value={d}>{d.slice(0, 4)}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setLog(!log)}
          aria-pressed={log}
          title="A log axis shows equal percentage moves as equal distances. On a rebased chart that is almost always what you want."
          className="rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: log ? "var(--accent)" : "var(--border)",
            color: log ? "var(--accent)" : "var(--text-muted)",
            background: "var(--bg-card)",
          }}
        >
          Log
        </button>
        <button
          onClick={() => setReal(!real)}
          aria-pressed={real}
          title="Deflate each series by its own country's CPI before rebasing, so the lines compare purchasing power rather than currencies. Currencies themselves drop out."
          className="rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: real ? "var(--accent)" : "var(--border)",
            color: real ? "var(--accent)" : "var(--text-muted)",
            background: "var(--bg-card)",
          }}
        >
          Real
        </button>
        <span className="text-xs text-[var(--text-dim)]">
          {picked.length}/{MAX_PICKS} selected
        </span>
      </div>
      {real && (
        <p className="text-[11px] text-[var(--text-muted)] -mt-1 mb-3">
          Real terms: each series is deflated by the CPI of the country it is priced in (US CPI for the
          dollar-quoted commodities) before being rebased, so these lines compare what a domestic
          investor&rsquo;s purchasing power did. Currencies are unavailable here by construction.
        </p>
      )}

      <div className="rounded-2xl border p-3 sm:p-4 mb-4" style={{ borderColor: "var(--border)" }}>
        {body}
        {lines.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {lines.map((l) => (
              <span key={l.slug} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
                <span style={{ ...MONO, color: l.last >= 100 ? "#10b981" : "#E2628B" }}>
                  {l.last >= 100 ? "+" : ""}{(l.last - 100).toFixed(0)}%
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {KINDS.map((kind) => (
        <div key={kind} className="mb-3">
          <div className="text-[11px] uppercase tracking-widest mb-1.5" style={{ ...MONO, color: "var(--text-muted)" }}>
            {KIND_LABEL[kind]}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {byKind[kind].map((s) => {
              const on = picked.includes(s.slug);
              const ok = eligible.has(s.slug);
              const p = prepared.get(s.slug);
              // Three different reasons a chip can be dead, and they mean
              // different things, so say which: no real view at all, a real
              // view that starts later than the price record, or simply a
              // series younger than the rebase date.
              const why = !p
                ? `${s.name} has no single deflator, so it drops out of the real view`
                : `${s.name} ${real && p.start !== s.start ? "can only be deflated from" : "only starts in"} ${p.start.slice(0, 4)}`;
              return (
                <button
                  key={s.slug}
                  onClick={() => ok && toggle(s.slug)}
                  disabled={!ok}
                  title={ok ? s.name : why}
                  className="rounded-md border px-2 py-1 text-xs transition"
                  style={{
                    borderColor: on ? "var(--accent)" : "var(--border)",
                    color: !ok ? "var(--text-dim)" : on ? "var(--accent)" : "var(--text-muted)",
                    background: "var(--bg-card)",
                    opacity: ok ? 1 : 0.45,
                    cursor: ok ? "pointer" : "not-allowed",
                  }}
                >
                  {s.name}
                  {!ok && <span style={MONO}> {p ? p.start.slice(0, 4) : "n/a"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
