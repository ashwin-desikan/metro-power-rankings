import Link from "next/link";
import type { ReactNode } from "react";
import { MONO, CARD } from "@/app/business/ui";
// SourcesCard is a generic closing card, not a predictions-specific one, and a
// third copy of it would be exactly the drift DESIGN-STANDARDS section 0.3
// warns about. Imported rather than reimplemented.
import { SourcesCard } from "@/app/predictions/_shared/ui";

// Shared shell for every /order page, following the BusinessNav / PredictionsNav
// idiom verbatim: crumbs, then a header carrying an as-of stamp, then a tab row.
// Copy these across any new Order board rather than hand-rolling a variant.

export { MONO, CARD, SourcesCard };

/** `Home / Order / <tab>` - the business Crumbs idiom, text-xs and muted. */
export function OrderCrumbs({ tab }: { tab?: string }) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="hover:underline">Home</Link>
      {" / "}
      {tab ? (
        <>
          <Link href="/order" className="hover:underline">Order</Link>
          {" / "}
          <span>{tab}</span>
        </>
      ) : (
        <span>Order</span>
      )}
    </nav>
  );
}

/**
 * Page header: TabHeader markup, h1 text-3xl sm:text-4xl, a 15px muted sub,
 * then the 10px MONO uppercase stamp. DESIGN-STANDARDS section 1.3: every data
 * page states its source and its as-of date, and the stamp is where.
 */
export function OrderHeader({
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
      {stamp ? (
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {stamp}
        </p>
      ) : null}
    </header>
  );
}
