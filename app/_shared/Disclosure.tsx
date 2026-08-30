import type { CSSProperties, ReactNode } from "react";

/**
 * Sitewide progressive-disclosure primitives.
 *
 * Why these exist
 * ---------------
 * The site's recurring mobile failure is not sideways scroll (the table
 * rules already gate that) — it is VERTICAL length. A board that reads as
 * one dense screen on a 1440px desktop becomes forty screens of thumb on a
 * 390px phone, because the desktop table collapses into a `sm:hidden` card
 * list where every row costs 80–200px instead of 32px. Measured 2026-08-04:
 * the US country page ran 80 screens at 390px, 68 of them one card list.
 *
 * The fix is not "cap it in a nested scroll box" — a scroll box inside a
 * scrolling page traps the thumb and hides the page's own end. The fix is
 * DENSITY BY ENVIRONMENT: the phone shows the top of a list and a control
 * that reveals the rest; the desktop, which has the room, shows all of it
 * with no control at all.
 *
 * Both components below are plain server components built on <details>, so
 * they cost no JS, survive SSR with no hydration flash, are keyboard- and
 * screen-reader-native, and let the browser's in-page find ("open all
 * closed details") reach hidden content.
 *
 * The `data-desktop-open` attribute is what makes "expanded on desktop,
 * contracted on mobile" work without JavaScript: app/globals.css force-
 * reveals the content of a marked <details> above 640px regardless of the
 * `open` attribute. The summary is then neutralised rather than removed —
 * for a Disclosure it carries the section TITLE, so it stays and simply
 * loses its chevron and its pointer; only ShowMore, whose summary is pure
 * control text ("Show all 42 metros"), is hidden outright. See the
 * "Environment-aware disclosure" block in globals.css.
 */

const CARD =
  "rounded-xl border overflow-hidden bg-[var(--bg-card)] border-[var(--border)]";
const SUMMARY =
  "flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none " +
  "min-h-11 hover:bg-[var(--bg-card-hover)] transition-colors " +
  "[&::-webkit-details-marker]:hidden";

function Chevron() {
  return (
    <svg
      className="details-chevron h-4 w-4 flex-shrink-0 transition-transform"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * A collapsible titled card — the standard container for any secondary
 * section (sources, methodology, a per-category breakdown, a long roster).
 *
 * `desktopOpen` is the default and the one you almost always want: the
 * section is collapsed on phones and fully open, with no toggle chrome, on
 * desktop. Pass `defaultOpen` for a section that should also start open on
 * a phone, or `desktopOpen={false}` for one that stays collapsible on every
 * viewport (a genuinely optional appendix).
 */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
  desktopOpen = true,
  id,
  className = "",
  style,
}: {
  title: ReactNode;
  /** Short right-aligned context: a count, a date, a unit. Keep it to a few words. */
  meta?: ReactNode;
  children: ReactNode;
  /** Start expanded on phones too. */
  defaultOpen?: boolean;
  /** Always expanded (and toggle-free) at >=640px. Default true. */
  desktopOpen?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      data-desktop-open={desktopOpen ? "" : undefined}
      className={`${CARD} ${className}`}
      style={style}
    >
      <summary className={SUMMARY}>
        <span className="min-w-0 font-semibold text-[var(--text)]">{title}</span>
        <span className="flex flex-shrink-0 items-center gap-2 text-sm text-[var(--text-muted)]">
          {meta}
          <Chevron />
        </span>
      </summary>
      <div className="border-t border-[var(--border)]">{children}</div>
    </details>
  );
}

/**
 * The length cap for a long list.
 *
 * Renders `head` (the first N rows, always visible) followed by `rest`
 * behind a "Show all N" control. On desktop the control disappears and the
 * whole list renders, because a desktop viewport can hold it.
 *
 * Prefer `<CappedList>` below — it does the slicing for you. Reach for
 * ShowMore directly only when the overflow content is not a uniform list
 * (e.g. the head is a table body and the tail needs different markup).
 */
export function ShowMore({
  children,
  label,
  className = "",
  bodyClassName = "",
}: {
  children: ReactNode;
  /** The control's text, e.g. "Show all 42 metros". */
  label: string;
  className?: string;
  /**
   * Classes for the revealed block. The overflow rows live inside the
   * <details>, so a `divide-y` / `grid gap-2` on the LIST does not reach
   * them — restate the list's own row treatment here so the tail looks
   * identical to the head.
   */
  bodyClassName?: string;
}) {
  return (
    <details data-desktop-open className={`show-more ${className}`}>
      <summary
        className="flex min-h-11 cursor-pointer select-none items-center justify-center gap-1.5
                   px-4 py-3 text-[13px] font-semibold text-[var(--text-muted)]
                   transition-colors hover:text-[var(--accent)]
                   [&::-webkit-details-marker]:hidden"
      >
        <span>{label}</span>
        <Chevron />
      </summary>
      <div className={bodyClassName}>{children}</div>
    </details>
  );
}

/**
 * The primitive to reach for whenever you render a list of more than
 * ~`initial` rows into a phone viewport — most often the `sm:hidden` card
 * fallback beside a desktop table.
 *
 * It renders every item on desktop and only the first `initial` on a phone,
 * with the remainder one tap away. Items stay in document order and in the
 * same parent element, so a divide-y / border-t row treatment still lands
 * on the right edges.
 *
 * ```tsx
 * <div className="sm:hidden rounded-xl border divide-y">
 *   <CappedList items={rows.map(r => <Row key={r.id} {...r} />)} noun="clubs" />
 * </div>
 * ```
 */
export function CappedList({
  items,
  initial = 10,
  noun = "rows",
  className = "",
  bodyClassName = "",
}: {
  items: ReactNode[];
  /** How many rows a phone shows before the control. Default 10. */
  initial?: number;
  /** Plural noun for the control's label, e.g. "clubs", "seasons". */
  noun?: string;
  className?: string;
  /** Row treatment to restate inside the reveal — see ShowMore. */
  bodyClassName?: string;
}) {
  if (items.length <= initial) return <>{items}</>;
  return (
    <>
      {items.slice(0, initial)}
      <ShowMore
        className={className}
        bodyClassName={bodyClassName}
        label={`Show all ${items.length} ${noun}`}
      >
        {items.slice(initial)}
      </ShowMore>
    </>
  );
}
