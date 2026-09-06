import type { ReactNode } from "react";
import { SectionHead } from "./SectionHead";
import { Disclosure } from "./Disclosure";

/**
 * A board with a heading that a phone can fold away.
 *
 * Why this exists
 * ---------------
 * `SectionHead` gives a board its title, its one-clause reading key and its
 * collapsed derivation. `Disclosure` folds a block away on a phone and opens it
 * with no chrome on a desktop. Every long hub wanted both and nobody had a
 * container for the pair, so sections were either always-open (a phone hub of
 * fifteen screens, most of them a board the reader scrolled past) or lost their
 * heading to the disclosure summary, which takes a string and drops the sub and
 * the `more` note with it.
 *
 * 🔴 THE ANCHOR STAYS ON THE HEADING, NOT ON THE FOLD. A tab row links to
 * `#standings`; if the id moved onto the <details> the browser would scroll to
 * a closed box. The heading keeps the id and stays visible at every width, so a
 * deep link always lands on something a reader can read.
 *
 * 🔴 THE DEFAULT IS COLLAPSED ON A PHONE, OPEN ON A DESKTOP. That is
 * `Disclosure`'s own default and it is the right one: a desktop viewport has the
 * room and a phone viewport has the thumb. Pass `defaultOpen` for the one board
 * a page is actually about.
 */
export function CollapsibleSection({
  id,
  title,
  sub,
  more,
  moreLabel,
  meta,
  children,
  defaultOpen = false,
  desktopOpen = true,
  className = "mb-10",
  bodyClassName = "p-3 sm:p-4",
}: {
  id?: string;
  title: string;
  sub: string;
  more?: ReactNode;
  moreLabel?: string;
  /** Short right-aligned context on the fold control: a count, a date. */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  desktopOpen?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={className}>
      <SectionHead id={id} title={title} sub={sub} more={more} moreLabel={moreLabel} />
      <Disclosure
        title={<span className="text-sm font-medium text-[var(--text-muted)]">{title}</span>}
        meta={meta}
        defaultOpen={defaultOpen}
        desktopOpen={desktopOpen}
        bodyClassName={bodyClassName}
      >
        {children}
      </Disclosure>
    </section>
  );
}
