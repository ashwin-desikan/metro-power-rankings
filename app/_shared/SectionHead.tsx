import type { ReactNode } from "react";

/**
 * The standard heading for a board.
 *
 * Why this exists
 * ---------------
 * Five near-identical local copies of this component had drifted across the
 * app (business/ui, ground-floor, skyscrapers, sports/expectation,
 * sports/heartbreak, predictions/scoreboard), each rendering a 40-75 word
 * paragraph between the heading and its table. Measured 2026-09-03: 1,635
 * words of prose sat in `sub=` props alone, across 51 files. On a phone, and
 * in any screenshot, that paragraph is the whole first screen and the board
 * the reader came for is below the fold.
 *
 * The rule this encodes: `sub` is the reading key, one clause, the thing you
 * need in order to read the column headers. Everything else — the derivation,
 * the caveat, the reason the unit is what it is — goes in `more` and collapses.
 * Nothing gets deleted, it moves.
 *
 * `more` is collapsed on every viewport, unlike `Disclosure` in this folder,
 * which opens on desktop by default. That is deliberate: the desktop wall of
 * text is the thing being fixed, so opening it on desktop would fix nothing.
 * Use `Disclosure` for a bottom-of-page methodology or sources card; use this
 * for the note that belongs with one board.
 */
export function SectionHead({
  title,
  sub,
  more,
  id,
  eyebrow,
  moreLabel = "How this is measured",
  className = "",
}: {
  title: string;
  /** One clause. The key to reading the board, not its justification. */
  sub: string;
  /** The derivation, caveats and exceptions. Collapsed on every viewport. */
  more?: ReactNode;
  id?: string;
  eyebrow?: string;
  /** Override when "measured" is the wrong verb, e.g. "How this is counted". */
  moreLabel?: string;
  className?: string;
}) {
  return (
    <div className={`mb-4 ${className}`}>
      {eyebrow ? (
        <p
          className="text-[11px] uppercase tracking-widest mb-2 font-mono"
          style={{ color: "var(--accent)" }}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 id={id} className={`text-2xl font-bold${id ? " scroll-mt-24" : ""}`}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">{sub}</p>
      {more ? (
        <details className="mt-1.5 max-w-3xl">
          <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">
            {moreLabel}
          </summary>
          <div className="mt-2 text-sm text-[var(--text-muted)]">{more}</div>
        </details>
      ) : null}
    </div>
  );
}
