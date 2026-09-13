'use client';

import { useTickerRotation } from './_shared/useTickerRotation';

// Today's digest headlines, one at a time, at the TOP of the masthead's left column —
// above the indices promo on desktop, directly under the intro on phones (Ashwin,
// 2026-09-13: "put it at the top, even ahead of the link to the rankings on the desktop
// side"). The full list lives in the "From the digest" section further down; this is the
// glanceable version, and its job is to send the reader to /digest, so the card is framed
// as the digest itself rather than as an anonymous news ticker.
//
// Motion rules live in useTickerRotation (shared with OnTodayTicker): auto-advance every
// 5s, hold still while pointer or focus is inside, a visible pause/play control, and no
// auto-advance under prefers-reduced-motion. Fixed height with a two-line clamp, so a
// long headline never shifts the page. Controls and the digest link are 44px on phones
// (DESIGN-STANDARDS §6) and compact from md up.

/** A tag as the server resolved it: label and the page it points at, nothing to look up. */
export type TickerTag = { label: string; href: string };

export type TickerItem = {
  headline: string;
  sourceName: string;
  url: string;
  /**
   * The digest buckets this story belongs to, pointing at those filters. A story can be
   * in two at once (Ashwin, 2026-09-13: "those four main topics are not exclusive"), so
   * this is a list; the page caps it at two to keep the chip row on one line.
   */
  topics?: TickerTag[];
  /** The story's own places, clubs and leagues, each pointing at its site page. */
  tags?: TickerTag[];
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

const BTN =
  'inline-flex h-11 w-11 md:h-8 md:w-8 items-center justify-center rounded border text-[13px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]';

const CHIP =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] leading-tight transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]';

export default function HeadlineTicker({ items, dateLabel }: { items: TickerItem[]; dateLabel: string }) {
  const count = items.length;
  const { index, step, paused, togglePaused, reducedMotion, running, holdHandlers } = useTickerRotation(count);

  if (count === 0) return null;
  const item = items[index];

  return (
    <section
      aria-label="Today's headlines"
      aria-roledescription="carousel"
      className="rounded-lg border p-4"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent)' }}
      {...holdHandlers}
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: 'var(--accent)' }}>
          📰 The daily digest · {dateLabel}
        </span>
        {count > 1 && (
          <span className="flex items-center gap-2">
            <button type="button" className={BTN} style={{ borderColor: 'var(--border)' }} onClick={() => step(-1)} aria-label="Previous headline">
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className={BTN}
              style={{ borderColor: 'var(--border)' }}
              onClick={togglePaused}
              aria-label={paused || reducedMotion ? 'Play headlines' : 'Pause headlines'}
              aria-pressed={paused}
              disabled={reducedMotion}
              title={reducedMotion ? 'Auto-play is off because your system asks for reduced motion' : undefined}
            >
              <span aria-hidden>{paused || reducedMotion ? '▶' : '❚❚'}</span>
            </button>
            <button type="button" className={BTN} style={{ borderColor: 'var(--border)' }} onClick={() => step(1)} aria-label="Next headline">
              <span aria-hidden>›</span>
            </button>
          </span>
        )}
      </div>

      {/* What the digest IS, said once, above the headline. Ashwin, 2026-09-13: "people
          will look at the ticker but won't know that the digest is a very useful thing to
          click on." A rotating headline reads as a news widget; this line says it is a
          daily read of ~50 newsletters, which is the reason to click through. */}
      <p className="mb-3 text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        About fifty newsletters, read and sorted every morning.
      </p>

      {/* Announce changes only when the reader is driving (paused or stepping), never on every
          automatic rotation, which would talk over whatever else they are doing. */}
      {/* The box is a FIXED height covering headline, source and the chip row, so the card
          does not resize as the headline rotates and a story with three tags does not push
          the digest button down past a story with none. */}
      <div aria-live={running ? 'off' : 'polite'} className="h-[6.1rem] overflow-hidden">
        <div key={index} className="ticker-in">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
            <span className="block text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
              {item.headline}
              <span className="text-[var(--text-dim)] ml-1" aria-hidden>↗</span>
            </span>
            <span className="block mt-1 text-[11px] uppercase tracking-widest truncate" style={{ ...MONO, color: 'var(--text-muted)' }}>
              {item.sourceName}
            </span>
          </a>
          {/* Tags. The topic chip is accent-tinted and leads, because it is the one tag
              that says which of the four hubs the story belongs to; the rest are the
              story's own places and teams and point at their pages on the site. Separate
              anchors, deliberately outside the headline link, so tapping a tag goes to the
              site and tapping the headline goes to the publisher. */}
          {((item.topics?.length ?? 0) > 0 || (item.tags?.length ?? 0) > 0) && (
            <div className="mt-1.5 flex h-[1.4rem] flex-wrap gap-1.5 overflow-hidden">
              {(item.topics ?? []).map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  className={CHIP}
                  style={{ ...MONO, color: 'var(--accent)', borderColor: 'var(--accent)' }}
                >
                  {t.label}
                </a>
              ))}
              {(item.tags ?? []).map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  className={CHIP}
                  style={{ ...MONO, color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                  {t.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The call to action, not a footnote. It was an 11px mono link in the bottom-right
          corner, which is where a reader's eye goes last — Ashwin, 2026-09-13: "make it
          much more obvious ... something that I personally want them to look at." A filled
          accent button, full width, with the line under it saying what is actually on the
          other side: the filters are the part nobody would guess from a ticker. */}
      <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-2 text-[11px]" style={{ ...MONO, color: 'var(--text-muted)' }} aria-hidden>
          {index + 1} / {count}
        </div>
        <a
          href="/digest"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: '#08080D' }}
        >
          Read today&rsquo;s digest <span aria-hidden>→</span>
        </a>
        <p className="mt-2 text-[11px] leading-snug" style={{ ...MONO, color: 'var(--text-muted)' }}>
          Every story, filterable by topic, sport and theme, sixty days back.
        </p>
      </div>
    </section>
  );
}
