import type { ReactNode } from "react";

// Collapsible country-hub section. Native <details>, so it works without any
// client JS and stays server-rendered. Defaults open — pass defaultOpen={false}
// for a section that should start collapsed. Mirrors the site's existing
// details-chevron pattern (globals.css rotates the chevron 180deg on open),
// the same one the Leaders / Conflicts / Billionaires sections already use, so
// every collapsible on the page reads as one system.
//
// The section id lives on the outer <section> so hub-nav anchor links and
// scroll-margin still land correctly.
export default function Collapsible({
  id,
  title,
  right,
  defaultOpen = true,
  collapseOnMobile = false,
  aside,
  className = "mb-12",
  titleClassName = "text-xl font-bold",
  children,
}: {
  id?: string;
  title: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  /** Closed on phones, open on >=640px, with no post-hydration collapse. Needs the
   *  desktop-open inline script at the end of the country page. */
  collapseOnMobile?: boolean;
  /** Rendered INSIDE this <section> but OUTSIDE the <details>, so it stays
   *  visible when the section is collapsed and cannot be separated from it by
   *  a reorder. Use for companion cards that belong to the section. */
  aside?: ReactNode;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={className} id={id}>
      {/* collapseOnMobile sections ship CLOSED and let CSS open them from 640px up
          (data-desktop-default-open, globals.css): the content is in the HTML for
          crawlers either way, a phone gets the collapsed page on first paint, and a
          desktop gets it open on first paint. The inline script at the end of the
          country page then turns that into a real `open` on desktop, so the reader
          can still fold a section there.

          🔴 This replaced MobileCollapse (2026-09-13), which rendered these OPEN and
          closed them on phones after hydration. The page then shrank by ~6 phone
          screens after load, yanking the scroll position of anyone who had started
          scrolling: probe:mobile failed /countries/united-states with "scroll
          position did not hold" on every dev server, and a slow phone saw the same
          jump. data-jump-reveal lets a section-nav jump open the section on a phone
          (the id sits on the <section>, so the details' own :target rule can't). */}
      {/* suppressHydrationWarning: the inline script deliberately changes `open` and
          removes data-desktop-default-open before React hydrates, which React would
          otherwise log as an attribute mismatch on every section. It only silences
          this element's own attributes, not its children. */}
      <details
        open={collapseOnMobile ? false : defaultOpen}
        data-desktop-default-open={collapseOnMobile && defaultOpen ? "" : undefined}
        data-jump-reveal={collapseOnMobile ? "" : undefined}
        suppressHydrationWarning
      >
        <summary className="cursor-pointer list-none flex items-baseline gap-3 mb-3 group">
          <span
            className={`${titleClassName} text-[var(--text)] group-hover:text-[var(--accent)] transition-colors`}
          >
            {title}
          </span>
          {right}
          <svg
            className="w-4 h-4 self-center shrink-0 text-[var(--text-dim)] transition-transform details-chevron ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        {children}
      </details>
      {aside}
    </section>
  );
}
