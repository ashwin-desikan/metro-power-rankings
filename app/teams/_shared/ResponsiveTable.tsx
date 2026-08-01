import type { CSSProperties, ReactNode } from "react";
import { TableScroll } from "@/app/_shared/TableScroll";

// Canonical mobile / desktop-table shell, extracted from the pattern that
// used to be hand-rolled (with a slightly different implementation each
// time) in ~10 files across the football hub. Callers keep full control of
// what a row looks like — this only owns the shell: the sm:hidden mobile
// view, the hidden sm:block table wrapped in TableScroll (so it always
// satisfies scripts/check-table-scroll.mjs), and a shared empty state.
//
// Two mobile variants:
//  - "list" (preferred for anything standings-shaped): ONE bordered
//    container with hairline-divided compact rows, matching the home
//    page's ranked-list language (IndexPreview / "In season now"). Pair
//    with <RankRow> below. ~40px per row.
//  - "cards": the legacy grid of individually bordered boxes. Only for
//    genuinely card-shaped data (e.g. a season record with many facets);
//    a 20-row standings table in this mode is 2,000px of mobile scroll.
export function ResponsiveTable({
  mobileRows,
  mobileEmpty,
  children,
  className = "rounded-xl border",
  style,
  compact = false,
  variant = "cards",
}: {
  mobileRows: ReactNode[];
  mobileEmpty?: ReactNode;
  children: ReactNode; // the <table>...</table>
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
  variant?: "cards" | "list";
}) {
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      {mobileRows.length > 0 ? (
        variant === "list" ? (
          <div
            className="sm:hidden rounded-xl border divide-y overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {mobileRows.map((row, i) => (
              <div key={i} className="border-[var(--border)]">
                {row}
              </div>
            ))}
          </div>
        ) : (
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
        )
      ) : (
        mobileEmpty != null && <div className="sm:hidden">{mobileEmpty}</div>
      )}
      <TableScroll className={`${className} hidden sm:block`} style={style}>
        {children}
      </TableScroll>
    </div>
  );
}

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Compact ranked row for ResponsiveTable's "list" variant — the home
// page's mobile row language (rank in dim mono, identity that truncates,
// one right-aligned mono metric) applied to standings/most-decorated/
// champions tables. Keep `sub`/`rightSub` to ONE short line each; deeper
// detail belongs on the desktop table, not crammed into the phone row.
export function RankRow({
  rank,
  name,
  sub,
  right,
  rightSub,
  highlight = false,
}: {
  rank?: ReactNode; // dim mono leading cell (rank #, year, seed…); omit to skip
  name: ReactNode; // identity: crest + club link + badges; truncates
  sub?: ReactNode; // one dim mono line under the name (e.g. "38 P · 26-7-5")
  right?: ReactNode; // right-aligned key metric (e.g. points)
  rightSub?: ReactNode; // dim unit/context under the metric (e.g. "pts")
  highlight?: boolean; // subtle accent tint (champion, live row…)
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={highlight ? { background: "rgba(78,205,196,0.06)" } : undefined}
    >
      {rank != null && (
        <span className="min-w-6 flex-shrink-0 text-right text-[11px]" style={{ ...MONO, color: "var(--text-dim)" }}>
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium leading-snug min-w-0">{name}</div>
        {sub && (
          <div className="mt-0.5 text-[11px] leading-snug truncate" style={{ ...MONO, color: "var(--text-dim)" }}>
            {sub}
          </div>
        )}
      </div>
      {(right != null || rightSub != null) && (
        <div className="flex-shrink-0 text-right">
          {right != null && (
            <div className="text-[13px] font-semibold tabular-nums leading-snug" style={MONO}>
              {right}
            </div>
          )}
          {rightSub != null && (
            <div className="text-[10px] uppercase tracking-wide" style={{ ...MONO, color: "var(--text-dim)" }}>
              {rightSub}
            </div>
          )}
        </div>
      )}
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
