import type { MarketProduction } from "@/lib/business";
import { MONO } from "../../ui";

// "Where it comes from" for /business/markets/[symbol].
//
// A price chart with no producers on it is a finance page wearing this site's
// layout. The subject here is geography, so the panel answers the question the
// price cannot: which countries this actually comes out of, and how that has
// moved over a century.
//
// SERVER COMPONENT ON PURPOSE. There is nothing to interact with, so this ships
// zero JavaScript: the SVG is rendered once at build or revalidate and sent as
// markup. The two charts on this route that DO need state (the price series and
// the compare overlay) are separate client components.
//
// SHARE, NOT VOLUME, is the y-axis. Absolute output rises with world demand, so
// an absolute chart mostly draws the world economy and buries the interesting
// movement. Share answers "who controls this", which is the question worth a
// chart: the United States falls from two thirds of world oil to a fifth and
// then climbs back through shale, and that shape only exists in share terms.

const PALETTE = ["#1E5EBE", "#0FA88F", "#7C3AED", "#E11D48", "#CA8A04", "#334155"];

function fmtShare(n: number | null): string {
  if (n == null) return "—";
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export default function ProductionPanel({ p, name }: { p: MarketProduction; name: string }) {
  const { leaders, shares } = p;
  if (!leaders.length) return null;
  const top = leaders[0];

  // chart geometry
  const W = 680, H = 240, PL = 34, PR = 108, PT = 12, PB = 24;
  const drawn = shares.filter((s) => s.series.length > 1);
  const years = drawn.flatMap((s) => s.series.map(([y]) => y));
  const y0 = years.length ? Math.min(...years) : p.first;
  const y1 = years.length ? Math.max(...years) : p.latest;
  const maxShare = Math.max(10, ...drawn.flatMap((s) => s.series.map(([, v]) => v)));
  const px = (y: number) => PL + ((y - y0) / Math.max(y1 - y0, 1)) * (W - PL - PR);
  const py = (v: number) => PT + (1 - v / maxShare) * (H - PT - PB);
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxShare * f));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(y0 + f * (y1 - y0)));

  return (
    <section className="mb-8 rounded-2xl border p-4 sm:p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-lg font-bold mb-1">Where it comes from</h2>
      <p className="text-[13px] text-[var(--text-muted)] mb-4 max-w-3xl">
        Share of world {p.commodity} production, {p.first} to {p.latest}, across {p.countries}{" "}
        producing countries.{" "}
        {top.share != null && top.peakShare != null && (
          <>
            {top.name} produces {fmtShare(top.share)}% of the world&rsquo;s {p.commodity} today
            {top.peakYear < p.latest - 5 ? (
              // A near-100% peak is not a data error: at the start of both
              // records one country was effectively the entire world market.
              // Say that, rather than print a bare 100% and invite the reader
              // to distrust the chart.
              top.peakShare >= 95 ? (
                <>
                  . In {top.peakYear} it was effectively the only producer on earth
                </>
              ) : (
                <>
                  , against {fmtShare(top.peakShare)}% at its peak in {top.peakYear}
                </>
              )
            ) : null}
            .{" "}
          </>
        )}
        Prices are set globally; the ground is not.
      </p>

      {drawn.length > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full mb-4"
          role="img"
          aria-label={`Share of world ${p.commodity} production by country, ${y0} to ${y1}`}
        >
          {gridlines.map((g) => (
            <g key={`g${g}`}>
              <line x1={PL} x2={W - PR} y1={py(g)} y2={py(g)} stroke="var(--border)" strokeWidth={1} />
              <text x={PL - 5} y={py(g) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
                {g}%
              </text>
            </g>
          ))}
          {xTicks.map((t, k) => (
            <text
              key={`x${k}`}
              x={PL + (k / 4) * (W - PL - PR)}
              y={H - 8}
              textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}
              fontSize={9}
              fill="var(--text-dim)"
              style={MONO}
            >
              {t}
            </text>
          ))}
          {drawn.map((s, i) => {
            const last = s.series[s.series.length - 1];
            return (
              <g key={s.iso3}>
                <path
                  d={s.series
                    .map(([y, v], j) => `${j === 0 ? "M" : "L"}${px(y).toFixed(1)},${py(v).toFixed(1)}`)
                    .join("")}
                  fill="none"
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <text
                  x={W - PR + 5}
                  y={py(last[1]) + 3}
                  fontSize={9}
                  fill={PALETTE[i % PALETTE.length]}
                  style={MONO}
                >
                  {s.name.length > 14 ? `${s.iso3} ` : `${s.name} `}
                  {fmtShare(last[1])}%
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ background: "var(--bg-card)" }}>
              <th className="px-3 py-2 text-[11px] uppercase tracking-widest font-semibold" style={{ ...MONO, color: "var(--text-muted)" }}>
                Producer
              </th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-widest font-semibold" style={{ ...MONO, color: "var(--text-muted)" }}>
                {p.latest} share
              </th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-widest font-semibold" style={{ ...MONO, color: "var(--text-muted)" }}>
                1980
              </th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-widest font-semibold" style={{ ...MONO, color: "var(--text-muted)" }}>
                Peak share
              </th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((l) => {
              const w = l.share != null ? (l.share / (leaders[0].share || 1)) * 100 : 0;
              const move = l.share != null && l.share1980 != null ? l.share - l.share1980 : null;
              return (
                <tr key={l.iso3} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">
                    {l.name}
                    <span className="ml-2 inline-block align-middle rounded-sm" style={{ width: `${Math.max(w * 0.6, 2)}px`, height: "6px", background: "var(--accent)", opacity: 0.5 }} />
                  </td>
                  <td className="px-3 py-2 text-right" style={MONO}>{fmtShare(l.share)}%</td>
                  <td className="px-3 py-2 text-right" style={{ ...MONO, color: "var(--text-muted)" }}>
                    {fmtShare(l.share1980)}%
                    {move != null && (
                      <span style={{ color: move >= 0 ? "#10b981" : "#E2628B" }}>
                        {" "}{move >= 0 ? "+" : ""}{move.toFixed(move > 10 || move < -10 ? 0 : 1)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ ...MONO, color: "var(--text-muted)" }}>
                    {fmtShare(l.peakShare)}% in {l.peakYear}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] mt-3">
        {p.source}. Output is measured in {p.unit} of energy content, so shares are comparable across
        fuels. Named countries account for {p.coverage}% of the {p.latest} world total; the remainder
        is output the source reports only inside regional aggregates rather than by country.
      </p>
    </section>
  );
}
