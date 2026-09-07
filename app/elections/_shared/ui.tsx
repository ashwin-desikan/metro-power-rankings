import Link from "next/link";
import type { ReactNode } from "react";
import { MONO, CARD, TH, THR, TD, TDR, SMCOL } from "@/app/business/ui";

// Shared shell for the elections family (DESIGN-STANDARDS section 1),
// copied from app/predictions/_shared/ui.tsx rather than hand-rolled so the
// two families stay one dialect. Server-safe: no hooks.

export { MONO, CARD, TH, THR, TD, TDR, SMCOL };

/** Breadcrumb row: `Home / Elections / <tab>`. Pass no `tab` on /elections itself. */
export function ElectionsCrumbs({ tab }: { tab?: string }) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="hover:underline">Home</Link>
      {" / "}
      {tab ? (
        <>
          <Link href="/elections" className="hover:underline">Elections</Link>
          {" / "}
          <span>{tab}</span>
        </>
      ) : (
        <span>Elections</span>
      )}
    </nav>
  );
}

/**
 * Page header: h1 `text-3xl sm:text-4xl font-bold tracking-tight`, a 15px
 * muted one-line sub, then the MONO uppercase stamp carrying "as of" plus the
 * row counts and the source. Every data page states its source and as-of
 * date; a page that cannot fill the stamp is not finished.
 */
export function ElectionsHeader({
  emoji,
  title,
  sub,
  stamp,
}: {
  emoji: string;
  title: string;
  sub: ReactNode;
  stamp?: string | null;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
        <span aria-hidden>{emoji}</span> {title}
      </h1>
      <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">{sub}</p>
      {stamp && (
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {stamp}
        </p>
      )}
    </header>
  );
}

/**
 * The sibling-hub switcher: Elections sits beside Leaders, Countries,
 * Conflicts and Constitutions in the geography layer. These are lateral
 * moves, not parents, so they render as a pill row under the tab nav and
 * never as back arrows. The one true parent (Home) lives in the crumbs.
 */
const SIBLINGS: [string, string][] = [
  ["/leaders", "World Leaders"],
  ["/countries", "Countries"],
  ["/conflicts", "Conflicts"],
  ["/constitutions", "Constitutions"],
];

export function SiblingHubs() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]" style={MONO}>
        Also in geography
      </span>
      {SIBLINGS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

/** The closing "Where these numbers come from" card (DESIGN-STANDARDS section 1.6). */
export function SourcesCard({
  children,
  title = "Where these numbers come from",
  id,
}: {
  children: ReactNode;
  title?: string;
  id?: string;
}) {
  return (
    <section id={id} className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <div className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl space-y-3">
        {children}
      </div>
    </section>
  );
}
