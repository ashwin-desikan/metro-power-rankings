'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTickerRotation } from './_shared/useTickerRotation';
// Pure lookup table, no server-only import: safe in a client component.
import { sportIcon } from '@/lib/sportLabels';

// Today's fixtures, one at a time, under the homepage's Live standings link (Ashwin,
// 2026-09-13: "something similar just about the live standings link ... derived from
// the on today section on the Live standings page"). The list comes from
// /api/on-today, which runs the standings page's own loader, so the two never disagree.
//
// Fetched after hydration so the homepage stays cheap to render. The box keeps its
// height from first paint at every width (a quiet placeholder while loading, a plain
// line when there is nothing on), so nothing below it moves. Rotation starts at the
// next fixture that has not kicked off yet; games already under way stay reachable
// with the buttons.
//
// One tree, two densities (DESIGN-STANDARDS §2, §6; Ashwin 2026-09-13 "both on phones"):
//  - phone: two rows, the stamp and 44px controls on top, then the fixture as a 44px
//    link with the teams on one line and time · league under it;
//  - md and up: a single 36px row with compact controls, as first built for desktop.

type Fixture = { sport: string; league: string; label: string; when: string; href: string | null };

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const BTN =
  'inline-flex h-11 w-11 md:h-7 md:w-7 items-center justify-center rounded border text-[13px] md:text-[12px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]';
// Fixed at both densities: phone p-2 + 44px controls row + gap + 44px fixture row.
const SHELL =
  'mb-2 h-[6.75rem] md:h-9 overflow-hidden rounded-md border p-2 md:py-0 md:px-2.5 flex flex-wrap md:flex-nowrap content-between md:content-normal items-center gap-x-2 gap-y-1 text-[13px]';

function localKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // A date-only feed (no kick-off time) arrives as UTC midnight: say "Today" rather than a fake 00:00.
  if (/T00:00:00(?:\.000)?(?:Z|\+00:00)$/.test(iso)) return 'Today';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function OnTodayTicker() {
  const [items, setItems] = useState<Fixture[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/on-today')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: Fixture[] }) => alive && setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  const list = items ?? [];
  const startAt = useMemo(() => {
    const now = Date.now();
    const next = list.findIndex((f) => new Date(f.when).getTime() >= now);
    return next === -1 ? 0 : next;
  }, [list]);
  const { index, step, paused, togglePaused, reducedMotion, running, holdHandlers } = useTickerRotation(list.length, { startAt });

  const shellStyle = { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' } as const;
  const stamp = (
    <span className="flex-shrink-0 uppercase tracking-widest text-[10px]" style={{ ...MONO, color: 'var(--accent)' }}>
      On today
    </span>
  );

  if (items === null || list.length === 0) {
    return (
      <div className={SHELL} style={shellStyle} aria-hidden={items === null}>
        {stamp}
        <span className="basis-full md:basis-auto min-w-0 truncate" style={{ ...MONO, color: items === null ? 'var(--text-dim)' : 'var(--text-muted)' }}>
          {items === null ? 'Loading today’s fixtures…' : 'No fixtures on today'}
        </span>
      </div>
    );
  }

  const f = list[index];
  const when = localKickoff(f.when);
  return (
    <div role="region" aria-label="Today's fixtures" aria-roledescription="carousel" className={SHELL} style={shellStyle} {...holdHandlers}>
      {stamp}
      {/* Phone: the controls share the stamp's row and the fixture drops to its own full-width
          row (order-last + basis-full). md and up: fixture between stamp and controls. */}
      <div aria-live={running ? 'off' : 'polite'} className="order-last md:order-none basis-full md:basis-auto min-w-0 md:flex-1 overflow-hidden">
        <a
          key={index}
          href={f.href ?? '/sports/standings'}
          className="ticker-in flex min-h-11 md:min-h-0 flex-col justify-center md:block md:truncate hover:text-[var(--accent)] transition-colors"
          title={`${f.label} · ${f.league}`}
        >
          <span className="md:hidden block truncate font-medium text-[var(--text)]">
            {sportIcon(f.sport) ? <span aria-hidden className="mr-1">{sportIcon(f.sport)}</span> : null}
            {f.label}
          </span>
          <span className="md:hidden block truncate text-[11px] tabular-nums" style={{ ...MONO, color: 'var(--text-muted)' }}>
            {when} · {f.league}
          </span>
          <span className="hidden md:inline">
            <span className="tabular-nums" style={{ ...MONO, color: 'var(--text-muted)' }}>{when}</span>
            {sportIcon(f.sport) ? <span aria-hidden> · {sportIcon(f.sport)}</span> : null}
            <span className="text-[var(--text)]"> · {f.label}</span>
            <span className="text-[var(--text-dim)]"> · {f.league}</span>
          </span>
        </a>
      </div>
      {list.length > 1 && (
        <span className="ml-auto md:ml-0 flex flex-shrink-0 items-center gap-2 md:gap-1.5">
          <span className="tabular-nums text-[10px]" style={{ ...MONO, color: 'var(--text-dim)' }} aria-hidden>
            {index + 1}/{list.length}
          </span>
          <button type="button" className={BTN} style={{ borderColor: 'var(--border)' }} onClick={() => step(-1)} aria-label="Previous fixture">
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            className={BTN}
            style={{ borderColor: 'var(--border)' }}
            onClick={togglePaused}
            aria-label={paused || reducedMotion ? 'Play fixtures' : 'Pause fixtures'}
            aria-pressed={paused}
            disabled={reducedMotion}
            title={reducedMotion ? 'Auto-play is off because your system asks for reduced motion' : undefined}
          >
            <span aria-hidden>{paused || reducedMotion ? '▶' : '❚❚'}</span>
          </button>
          <button type="button" className={BTN} style={{ borderColor: 'var(--border)' }} onClick={() => step(1)} aria-label="Next fixture">
            <span aria-hidden>›</span>
          </button>
        </span>
      )}
    </div>
  );
}
