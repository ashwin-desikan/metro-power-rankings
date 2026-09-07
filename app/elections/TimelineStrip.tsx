// Server-rendered "every election ever" strip: one row per polity, one dot per
// election, 1788–2026. Dots are plain anchors with native-title tooltips, so
// the whole visualization ships as HTML with zero client JavaScript. Colors
// follow the honesty framing: teal = free contest, amber = restricted or
// tilted, dark red = unfree ritual.

export type TlDot = { id: string; y: number; t: string; f: 0 | 1 | 2 };
export type TlRow = {
  code: string;
  name: string;
  href: string;
  dots: TlDot[];
  /** Set on the first row of a region group (the three pinned rows carry
   *  none): renders a MONO uppercase label plus a separator line ahead of
   *  this row, so the US/UK/EU-then-by-region order reads on the picture. */
  groupLabel?: string;
};

const X0 = 1785;
const X1 = 2027;
const PX_PER_YEAR = 7.5;
const PAD_L = 132;
const ROW_H = 18;
const PAD_T = 26;
// Extra vertical space reserved above a row that opens a new region group,
// for its label and separator line. Row height itself (ROW_H) is unchanged.
// The label sits in the middle of its own band, a full row and a half above
// the group's first country, so it cannot blend into that country's name
// (it did at 18px, Ashwin 2026-09-07). The band is tinted so it reads as a
// divider, and the label is left-aligned in the gutter while country names
// stay right-aligned, so the two never line up as one list.
const GROUP_GAP = 30;
const COLORS: Record<0 | 1 | 2, string> = { 0: "#4ECDC4", 1: "#D97706", 2: "#8E1B1B" };
const GROUP_LABEL_STYLE = { fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" } as const;

export default function TimelineStrip({ rows }: { rows: TlRow[] }) {
  const width = PAD_L + (X1 - X0) * PX_PER_YEAR + 16;
  // newest on the LEFT: the present sits beside the country labels, and
  // scrolling right travels back in time
  const x = (year: number) => PAD_L + (X1 - year) * PX_PER_YEAR;
  const decades: number[] = [];
  for (let d = 1790; d <= 2020; d += 20) decades.push(d);

  // Lay rows out top to bottom, inserting GROUP_GAP of extra space above any
  // row carrying a groupLabel. Row height (ROW_H) never changes.
  let cursorY = PAD_T;
  const layout = rows.map((r) => {
    if (r.groupLabel) cursorY += GROUP_GAP;
    const cy = cursorY + 8;
    cursorY += ROW_H;
    return { row: r, cy };
  });
  const height = cursorY + 10;

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
        {layout.map(({ row: r, cy }) => (
          <g key={r.code}>
            {r.groupLabel ? (
              <>
                <rect
                  x={0} y={cy - ROW_H / 2 - GROUP_GAP + 2} width={width} height={GROUP_GAP - 6}
                  fill="var(--bg-card-hover)" opacity={0.6}
                />
                <line
                  x1={0} y1={cy - ROW_H / 2 - 4} x2={width} y2={cy - ROW_H / 2 - 4}
                  stroke="var(--border)" strokeWidth={1}
                />
                <text
                  x={10} y={cy - ROW_H / 2 - GROUP_GAP / 2 + 3} textAnchor="start" fontSize={9.5}
                  fill="var(--text-muted)" style={GROUP_LABEL_STYLE}
                >
                  {r.groupLabel.toUpperCase()}
                </text>
              </>
            ) : null}
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
        ))}
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
