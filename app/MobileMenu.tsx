'use client';

import { useEffect, useRef, useState } from 'react';

// Mobile-only disclosure menu. The desktop nav in SiteNav.tsx is hidden
// below md (768px); this component fills that gap so phone users can reach
// every page that lives in the top nav. Flat list rather than nested
// dropdowns because nested menus on mobile feel cramped on a thumb.

type Item = {
  href: string;
  label: string;
  hint?: string;
  external?: boolean;
  group?: string;
};

const ITEMS: Item[] = [
  { href: '/#rankings', label: 'Rankings', hint: 'Top metros by composite score' },
  { href: '/#regions', label: 'Regions', hint: 'Group view by world region' },

  { href: '/compare', label: 'Compare', hint: 'Side-by-side any 2 to 4 metros', group: 'Data' },
  { href: '/countries', label: 'Countries', hint: 'Population, metros, and composite score by country', group: 'Data' },
  { href: '/badges', label: 'Badges', hint: 'Categorical lenses over the dataset', group: 'Data' },
  { href: '/matchups/london-vs-new-york', label: 'Matchups', hint: 'Head-to-head metro pages', group: 'Data' },
  { href: '/random', label: '🎲 Random metro', hint: 'Tier-weighted random pick', group: 'Data' },

  { href: '/sports', label: 'All sports', hint: 'Every Major League team across every sport, on one filterable map', group: 'Sports' },
  { href: '/teams/nfl', label: 'NFL', hint: 'All 32 active franchises; defunct franchises link from inside', group: 'Sports' },
  { href: '/teams/mlb', label: 'MLB', hint: 'All 30 active franchises; defunct franchises link from inside', group: 'Sports' },
  { href: '/teams/nba', label: 'NBA', hint: 'All 30 active franchises; ABA cups in slate; live 2026 playoff status', group: 'Sports' },

  {
    href: 'https://citizenofnowhere.substack.com',
    label: 'Citizen of Nowhere',
    hint: 'All essays on Substack',
    external: true,
    group: 'Articles',
  },
  { href: '/neighborhoods', label: 'The Last of the Marylebones', hint: 'Global neighborhoods reference', group: 'Articles' },
  { href: '/top-teams', label: 'The Team That Wins the City', hint: 'Top sports team by metro', group: 'Articles' },

  { href: '/methodology', label: 'Methodology' },
  { href: '/about', label: 'About' },
  { href: '/updates', label: 'Release notes' },
];

export default function MobileMenu({ updated }: { updated: string | null }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Group items in render order, preserving section dividers between groups
  const groupedItems: { group?: string; items: Item[] }[] = [];
  for (const it of ITEMS) {
    const last = groupedItems[groupedItems.length - 1];
    if (last && last.group === it.group) {
      last.items.push(it);
    } else {
      groupedItems.push({ group: it.group, items: [it] });
    }
  }

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.28 4.22a.75.75 0 011.06 0L10 8.94l4.66-4.72a.75.75 0 111.06 1.06L11.06 10l4.66 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.66 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.28 5.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M2.5 5.25a.75.75 0 01.75-.75h13.5a.75.75 0 010 1.5H3.25a.75.75 0 01-.75-.75zm0 4.75a.75.75 0 01.75-.75h13.5a.75.75 0 010 1.5H3.25a.75.75 0 01-.75-.75zm0 4.75a.75.75 0 01.75-.75h13.5a.75.75 0 010 1.5H3.25a.75.75 0 01-.75-.75z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-full border-b shadow-xl backdrop-blur-md max-h-[calc(100vh-4rem)] overflow-y-auto"
          style={{
            backgroundColor: 'rgba(8, 8, 13, 0.97)',
            borderColor: 'var(--border)',
          }}
        >
          <nav className="px-4 py-3 space-y-1">
            {groupedItems.map((g, gi) => (
              <div key={gi}>
                {g.group ? (
                  <div
                    className="text-xs uppercase tracking-wider mt-3 mb-1 px-2"
                    style={{
                      color: 'var(--text-dim)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {g.group}
                  </div>
                ) : null}
                {g.items.map((it) => (
                  <a
                    key={it.href}
                    href={it.href}
                    target={it.external ? '_blank' : undefined}
                    rel={it.external ? 'noopener noreferrer' : undefined}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                  >
                    <div className="text-sm font-medium text-[var(--text)]">
                      {it.label}
                      {it.external ? (
                        <span
                          className="ml-1 text-[var(--text-dim)]"
                          aria-hidden="true"
                        >
                          ↗
                        </span>
                      ) : null}
                    </div>
                    {it.hint ? (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {it.hint}
                      </div>
                    ) : null}
                  </a>
                ))}
              </div>
            ))}
            {updated ? (
              <div
                className="mt-3 pt-3 border-t text-xs text-[var(--text-muted)] px-3"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Source data last updated {updated}
              </div>
            ) : null}
          </nav>
        </div>
      )}
    </div>
  );
}
