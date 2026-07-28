import type { CSSProperties, ReactNode } from "react";

// Headline stat block for hero sections and "Footprint"-style summary grids
// — a visual step up from the plain text-only <Stat> rows the hub used
// before, while staying inside the site's existing card/border language.
export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5 leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function StatGrid({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 ${className}`} style={style}>
      {children}
    </div>
  );
}
