// Server-rendered "every election ever" strip: one row per polity, one dot per
// election, 1788–2026. Dots are plain anchors with native-title tooltips, so
// the whole visualization ships as HTML with zero client JavaScript. Colors
// follow the honesty framing: teal = free contest, amber = restricted or
// tilted, dark red = unfree ritual.

export type TlDot = { id: string; y: number; t: string; f: 0 | 1 | 2 };
export type TlRow = { code: string; name: string; href: string; dots: TlDot[] };

const X0 = 1785;
const X1 = 2027;
const PX_PER_YEAR = 7.5;
const PAD_L = 118;
const ROW_H = 17;
const PAD_T = 26;
const COLORS: Record<0 | 1 | 2, string> = { 0: "#4ECDC4", 1: "#D97706", 2: "#8E1B1B" };

export default function TimelineStrip({ rows }: { rows: TlRow[] }) {
  const width = PAD_L + (X1 - X0) * PX_PER_YEAR + 16;
  const height = PAD_T + rows.length * ROW_H + 10;
  // newest on the LEFT: the present sits beside the country labels, and
  // scrolling right travels back in time
  const x = (year: number) => PAD_L + (X1 - year) * PX_PER_YEAR;
  const decades: number[] = [];
  for (let d = 1790; d <= 2020; d += 20) decades.push(d);

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <svg width={width} height={height} role="img" aria-label="Every election in the atlas, by polity and year">
        {/* decade gridlines */}
        {decades.map((d) => (
          <g key={d}>
            <line x1={x(d)} y1={PAD_T - 8} x2={x(d)} y2={height - 8} stroke="var(--border)" strokeWidth={1} />
            <text x={x(d)} y={14} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{d}</text>
          </g>
        ))}
        {/* rows */}
        {rows.map((r, i) => {
          const cy = PAD_T + i * ROW_H + 8;
          return (
            <g key={r.code}>
              <a href={r.href}>
                <text x={PAD_L - 10} y={cy + 3.5} textAnchor="end" fontSize={10.5} fill="var(--text-muted)" style={{ fontWeight: 600 }}>
                  {r.name}
                </text>
              </a>
              <line x1={PAD_L} y1={cy} x2={width - 12} y2={cy} stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />
              {r.dots.map((d) => (
                <a key={d.id} href={`${r.href}/${d.id}`}>
                  <circle cx={x(d.y)} cy={cy} r={3.1} fill={COLORS[d.f]} opacity={d.f === 0 ? 0.95 : 0.85}>
                    <title>{d.t}</title>
                  </circle>
                </a>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs text-[var(--text-muted)] mt-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#4ECDC4" }} /> free contest
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#D97706" }} /> restricted or tilted
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#8E1B1B" }} /> unfree ritual
      </span>
      <span className="text-[var(--text-dim)]">Hover any dot for the election; click to open it.</span>
    </div>
  );
}
