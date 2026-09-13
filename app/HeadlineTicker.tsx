'use client';

import { useTickerRotation } from './_shared/useTickerRotation';

// Today's digest headlines, one at a time, in the masthead's left column (Ashwin
// 2026-09-13: on desktop the column ran ~258px short of the right one at 1280 and 1440;
// "both on phones" the same day, where it sits under the intro). The full list lives in
// the "From the digest" section further down; this is the glanceable version.
//
// Motion rules live in useTickerRotation (shared with OnTodayTicker): auto-advance every
// 5s, hold still while pointer or focus is inside, a visible pause/play control, and no
// auto-advance under prefers-reduced-motion. Fixed height with a two-line clamp, so a
// long headline never shifts the page. Controls and the digest link are 44px on phones
// (DESIGN-STANDARDS §6) and compact from md up.

export type TickerItem = { headline: string; sourceName: string; url: string };

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

const BTN =
  'inline-flex h-11 w-11 md:h-8 md:w-8 items-center justify-center rounded border text-[13px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]';

export default function HeadlineTicker({ items, dateLabel }: { items: TickerItem[]; dateLabel: string }) {
  const count = items.length;
  const { index, step, paused, togglePaused, reducedMotion, running, holdHandlers } = useTickerRotation(count);

  if (count === 0) return null;
  const item = items[index];

  return (
    <section
      aria-label="Today's headlines"
      aria-roledescription="carousel"
      className="mt-3 rounded-lg border p-4"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      {...holdHandlers}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: 'var(--accent)' }}>
          📰 In the news · {dateLabel}
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

      {/* Announce changes only when the reader is driving (paused or stepping), never on every
          automatic rotation, which would talk over whatever else they are doing. */}
      <div aria-live={running ? 'off' : 'polite'} className="h-[4.25rem] overflow-hidden">
        <a key={index} href={item.url} target="_blank" rel="noopener noreferrer" className="ticker-in block group">
          <span className="block text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
            {item.headline}
            <span className="text-[var(--text-dim)] ml-1" aria-hidden>↗</span>
          </span>
          <span className="block mt-1 text-[11px] uppercase tracking-widest truncate" style={{ ...MONO, color: 'var(--text-muted)' }}>
            {item.sourceName}
          </span>
        </a>
      </div>

      <div className="mt-3 pt-1 md:pt-2.5 border-t flex items-center justify-between gap-3 text-[11px]" style={{ ...MONO, color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
        <span aria-hidden>
          {index + 1} / {count}
        </span>
        <a href="/digest" className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--accent)] transition-colors">
          Every story in today&rsquo;s digest →
        </a>
      </div>
    </section>
  );
}
