import Link from "next/link";
import type { ReactNode } from "react";
import { MONO, CARD, TH, THR, TD, TDR, SMCOL } from "@/app/business/ui";

// Shared shell for every /predictions hub and /play/picks. Server-safe
// (no hooks) except where noted. Copy this file's idioms verbatim across
// cfb/mlb/pl/ucl/scoreboard/picks rather than hand-rolling a variant -
// that drift is exactly what this shared shell exists to end.

export { MONO, CARD, TH, THR, TD, TDR, SMCOL };

/**
 * Breadcrumb row: `Home / Predictions / <tab>`, business `Crumbs` idiom
 * (`text-xs`, muted, `mb-4`). Pass no `tab` for the index page itself.
 * `/play/picks` is the one exception in the family - pass
 * `root={{ label: "Play", href: "/play" }}` there so the crumb reads
 * `Home / Play / Picks` instead of `Home / Predictions / Picks`.
 */
export function PredCrumbs({
  tab,
  root = { label: "Predictions", href: "/predictions" },
}: {
  tab?: string;
  root?: { label: string; href: string };
}) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="hover:underline">Home</Link>
      {" / "}
      {tab ? (
        <>
          <Link href={root.href} className="hover:underline">{root.label}</Link>
          {" / "}
          <span>{tab}</span>
        </>
      ) : (
        <span>{root.label}</span>
      )}
    </nav>
  );
}

/**
 * Page header: exactly `TabHeader`'s markup (h1 `text-3xl sm:text-4xl
 * font-bold tracking-tight`, 15px muted sub, 10px MONO uppercase stamp)
 * plus the optional LIVE dot the hubs already render inline with the h1.
 */
export function PredHeader({
  emoji,
  title,
  sub,
  stamp,
  live = false,
}: {
  emoji: string;
  title: string;
  sub: ReactNode;
  stamp?: string | null;
  /** Renders the green-dot "LIVE" pill next to the h1. */
  live?: boolean;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          <span aria-hidden>{emoji}</span> {title}
        </h1>
        {live && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        )}
      </div>
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
 * The closing "Where these numbers come from" card (DESIGN-STANDARDS §1.6).
 * Every hub ends with one naming its data sources, as-of date, sim count
 * and caveats. `children` is that prose (plain <p> tags read fine); fold
 * any existing "How the model works" writeup INTO this card as a
 * `<Disclosure title="How the model works" desktopOpen>` block rather than
 * a sibling section, so a phone reader gets a heading first and a desktop
 * reader gets the full text with no extra tap.
 */
/**
 * Small MONO uppercase 10px group label, phone only (`sm:hidden`). Use
 * directly above a `ResponsiveTable`'s mobile list whenever that list
 * replaces a table grouped by division/conference/league - carry exactly
 * the text the desktop table's first header cell shows for that group
 * ("AFC East", "SEC", "American League"), so the phone reader gets the
 * same grouping context the desktop header already gives for free.
 */
/**
 * "1 game" / "2 games" - pluralises a Disclosure `meta` count. Pass the
 * plural form; a trailing "s" is dropped for singular unless `singular` is
 * given explicitly (e.g. plural(1, "clubs", "club")).
 */
export function plural(n: number, noun: string, singular?: string): string {
  const word = n === 1 ? (singular ?? noun.replace(/s$/, "")) : noun;
  return `${n} ${word}`;
}

export function ListLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="sm:hidden px-1 pb-1.5 text-[10px] uppercase tracking-widest"
      style={{ ...MONO, color: "var(--text-dim)" }}
    >
      {children}
    </div>
  );
}

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
