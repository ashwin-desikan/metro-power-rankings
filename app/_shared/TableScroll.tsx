import type { CSSProperties, ReactNode } from "react";

/**
 * Canonical horizontal-scroll wrapper for a <table>. Renders the table as
 * its own direct DOM child so it always qualifies for the sitewide
 * `.overflow-x-auto:has(> table)` rule in app/globals.css (sticky header on
 * all screens, sticky first column + touch scrolling under 640px).
 *
 * className/style let call sites keep their card border/padding/background
 * (e.g. `className="rounded-xl border" style={card}`); "overflow-x-auto" is
 * always included regardless of what's passed in.
 *
 * scripts/check-table-scroll.mjs enforces that every <table> in app/ is
 * either wrapped in this component or hand-carries an equivalent overflow
 * class, so a future edit can't silently detach a table from this behavior.
 */
export function TableScroll({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={["overflow-x-auto", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}
