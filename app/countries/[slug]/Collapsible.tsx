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
  className = "mb-12",
  titleClassName = "text-xl font-bold",
  children,
}: {
  id?: string;
  title: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={className} id={id}>
      <details open={defaultOpen}>
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
    </section>
  );
}
