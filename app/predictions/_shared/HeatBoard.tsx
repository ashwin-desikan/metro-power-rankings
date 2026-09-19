import Link from "next/link";
import { MONO } from "@/app/business/ui";

// Generic heat board: a grid of groups (conferences), each holding columns
// (divisions), each holding small value tiles (teams). Server-safe, no
// hooks. Built for the NFL division heat board but kept generic so another
// hub can reuse it for its own group/column/cell shape.
//
// Colour: tiles bucket into the --seq-1..5 sequential tokens (DESIGN-
// STANDARDS.md sec 7, "chart colour is computed, never chosen"). The value
// TEXT always keeps var(--text) - never the series colour - per the same
// section ("text wears text tokens, never the series colour"). The seq
// colour instead tints the tile background at low opacity and fills a left
// border at full strength, the same layering DataBar's bar used before it
// was retired for repeating the number: here the colour carries information
// the number does not (how this tile compares to the rest of the board at a
// glance), so it earns its place.

export type HeatCell = {
  key: string;
  abbr: string;
  title: string;
  value: number;
  href?: string | null;
};

export type HeatColumn = {
  label: string;
  cells: HeatCell[];
};

export type HeatGroup = {
  label: string;
  columns: HeatColumn[];
};

// Tint strength per bucket. The top step stops at 45%: --seq-5 mixed any
// stronger over --bg-card drops var(--text) below 4.5:1 (measured 3.7:1 at 60%).
const TINT = [10, 18, 27, 36, 45] as const;

function bucket(value: number, max: number): { color: string; tint: number } {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const idx = Math.min(4, Math.floor(ratio * 5));
  return { color: `var(--seq-${idx + 1})`, tint: TINT[idx] };
}

function Tile({
  cell,
  columnLabel,
  max,
  valueLabel,
}: {
  cell: HeatCell;
  columnLabel: string;
  max: number;
  valueLabel: (v: number) => string;
}) {
  const { color, tint } = bucket(cell.value, max);
  const label = valueLabel(cell.value);
  const aria = `${cell.title}, ${label} to win the ${columnLabel}`;
  const style = {
    borderLeftColor: color,
    background: `color-mix(in srgb, ${color} ${tint}%, var(--bg-card))`,
  };
  const inner = (
    <>
      <span className="truncate text-[11px] font-semibold" style={{ color: "var(--text)" }}>
        {cell.abbr}
      </span>
      <span className="tabular-nums text-[11px]" style={{ ...MONO, color: "var(--text)" }}>
        {label}
      </span>
    </>
  );
  const className =
    "flex min-h-[44px] min-w-0 flex-col justify-center gap-0.5 rounded-lg border-l-4 px-2 py-1.5";
  return cell.href ? (
    <Link href={cell.href} aria-label={aria} className={`${className} transition-colors hover:brightness-110`} style={style}>
      {inner}
    </Link>
  ) : (
    <div aria-label={aria} className={className} style={style}>
      {inner}
    </div>
  );
}

export function HeatBoard({
  groups,
  max = 100,
  valueLabel,
}: {
  groups: HeatGroup[];
  max?: number;
  valueLabel: (v: number) => string;
}) {
  if (!groups.length) return null;
  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.label} className="min-w-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {g.label}
          </h3>
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
            {g.columns.map((col) => (
              <div key={col.label} className="min-w-0">
                <div
                  className="mb-1 truncate text-[10px] uppercase tracking-widest"
                  style={{ ...MONO, color: "var(--text-dim)" }}
                >
                  {col.label}
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-1">
                  {col.cells.map((cell) => (
                    <Tile key={cell.key} cell={cell} columnLabel={col.label} max={max} valueLabel={valueLabel} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
