import type { CSSProperties, ReactNode } from "react";
import { TableScroll } from "@/app/_shared/TableScroll";

// Canonical mobile-card / desktop-table shell, extracted from the pattern
// that used to be hand-rolled (with a slightly different implementation
// each time) in ~10 files across the football hub. Callers keep full
// control of what a row/card looks like — this only owns the shell: the
// sm:hidden card grid, the hidden sm:block table wrapped in TableScroll
// (so it always satisfies scripts/check-table-scroll.mjs), and a shared
// empty state.
export function ResponsiveTable({
  mobileRows,
  mobileEmpty,
  children,
  className = "rounded-xl border",
  style,
  compact = false,
}: {
  mobileRows: ReactNode[];
  mobileEmpty?: ReactNode;
  children: ReactNode; // the <table>...</table>
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      {mobileRows.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {mobileRows.map((row, i) => (
            <div
              key={i}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {row}
            </div>
          ))}
        </div>
      ) : (
        mobileEmpty != null && <div className="sm:hidden">{mobileEmpty}</div>
      )}
      <TableScroll className={`${className} hidden sm:block`} style={style}>
        {children}
      </TableScroll>
    </div>
  );
}

// Small labeled stat block for inside a ResponsiveTable mobile card.
export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

// Header row for a mobile card: primary label on the left, optional
// secondary content (badge, position, points) on the right.
export function MiniCardHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="font-medium truncate">{left}</div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
