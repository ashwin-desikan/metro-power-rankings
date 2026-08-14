'use client';

import { useEffect, useRef, useState } from 'react';
import { leagueStatusFor, clubFootballStatus } from '@/lib/leagueStatus';
import { catalogByFamily, boardLabelFor, SPORTS_FEATURES } from '@/lib/sportsCatalog';

// Mobile-only menu. The desktop nav in SiteNav.tsx is hidden below md (768px);
// this fills that gap. It mirrors the desktop mega-menus as collapsible
// top-level sections: the panel opens to a short list of section headers, and
// each expands to reveal its grouped contents. The Sports section (features +
// every league family) and Geography groups are generated from the same
// sources the desktop nav uses (lib/sportsCatalog), so the surfaces never drift.

type Leaf = { href: string; label: string; hint?: string; external?: boolean; live?: boolean };
type SubGroup = { label?: string; items: Leaf[] };
type Section =
  | { kind: 'link'; href: string; label: string; external?: boolean }
  | { kind: 'group'; id: string; label: string; groups: SubGroup[] };

const NAV_TONE_COLOR: Record<string, string> = {
  regular: '#10b981',
  playoffs: '#f59e0b',
  worldcup: '#a855f7',
  offseason: '#55556A',
};

function leafDotColor(leaf: Leaf): string | null {
  if (leaf.live) return '#10b981';
  const s = leaf.href === '/teams/football' ? clubFootballStatus() : leagueStatusFor(leaf.href);
  if (s && s.tone !== 'offseason') return NAV_TONE_COLOR[s.tone];
  return null;
}

function buildSections(): Section[] {
  const geography: SubGroup[] = [
    {
      label: 'Places & directories',
      items: [
        { href: '/geography', label: 'Geography Hub' },
        { href: '/rankings', label: 'Metro Power Rankings' },
        { href: '/ground-floor', label: 'The Ground Floor' },
        { href: '/countries', label: 'Countries' },
        { href: '/states', label: 'States & Provinces' },
        { href: '/skyscrapers', label: 'Supertall Skyscrapers' },
        { href: '/expandable-map', label: 'Expandable Map' },
        { href: '/compare', label: 'Compare metros' },
        { href: '/matchups/london-vs-new-york', label: 'Matchups' },
      ],
    },
    {
      label: 'Power & people',
      items: [
        { href: '/power', label: 'The Nowhere 100' },
        { href: '/leaders', label: 'World Leaders' },
        { href: '/power-atlas', label: 'The Power Atlas' },
        { href: '/us-political-leadership', label: 'US Political Leadership' },
        { href: '/uk-political-leadership', label: 'UK Political Leadership' },
        { href: '/elections', label: 'Elections' },
        { href: '/mayors', label: 'Mayors of the World' },
      ],
    },
    {
      label: 'Geopolitics',
      items: [
        { href: '/orgs', label: 'Alliances & Orgs' },
        { href: '/conflicts', label: 'Interstate Wars' },
      ],
    },
    {
      label: 'Across time',
      items: [
        { href: '/time-machine', label: '🕰️ The Time Machine' },
        { href: '/predictions', label: '🔮 Predictions' },
      ],
    },
    {
      label: 'More',
      items: [
        { href: '/badges', label: 'Badges' },
        { href: '/random', label: '🎲 Random metro' },
      ],
    },
  ];

  const sports: SubGroup[] = [
    {
      label: 'Across all sports',
      items: [
        { href: '/sports', label: 'Zone Zero Sports Hub' },
        ...SPORTS_FEATURES.map((f) => ({ href: f.href, label: f.label, live: f.live })),
      ],
    },
    ...catalogByFamily(false).map((g) => ({
      label: g.family,
      items: g.entries.map((e) => ({ href: e.href, label: boardLabelFor(e) })),
    })),
  ];

  const deepDives: SubGroup[] = [
    {
      items: [
        { href: '/deep-dives', label: 'All deep dives' },
        { href: '/sports/geography-of-erasure', label: 'The Geography of Erasure' },
        { href: '/sports/heartbreak', label: 'The Heartbreak Index' },
        { href: '/sports/games', label: 'The Greatest Games' },
        { href: '/sports/valuations', label: 'Team Valuations' },
        { href: '/top-teams', label: 'The Team That Wins the City' },
        { href: '/neighborhoods', label: 'The Last of the Marylebones' },
        { href: '/badges/velvet-rock-capital', label: 'Velvet Rock Capital' },
        { href: 'https://citizenofnowhere.substack.com', label: 'On Substack', external: true },
      ],
    },
  ];

  const play: SubGroup[] = [
    {
      items: [
        { href: '/play', label: '🎮 Kids Games', hint: 'Free learning games for younger fans' },
        { href: '/play/arcade', label: '🕹️ Games', hint: 'Bigger games: random metro, quizzes and more' },
      ],
    },
  ];

  const about: SubGroup[] = [
    {
      items: [
        { href: '/about', label: 'About' },
        { href: '/methodology', label: 'Methodology' },
        { href: '/privacy', label: 'Privacy' },
      { href: '/studio', label: 'Studio' },
      ],
    },
  ];

  // Curated like the desktop Culture mega-menu: marquee destinations only —
  // each hub's own tab nav and "More from" cards carry the long tail.
  const culture: SubGroup[] = [
    {
      label: '🎵 Music',
      items: [
        { href: '/sound', label: 'The Sound of the Metros' },
        { href: '/sound/charts', label: 'Live Charts' },
        { href: '/sound/rankings', label: 'Rankings by Metro' },
        { href: '/sound/artists', label: 'Artists' },
        { href: '/sound/grammys', label: 'Awards History' },
        { href: '/sound/number-ones', label: 'Number-One Machines' },
        { href: '/sound/rolling-stone-500', label: 'RS 500 Greatest Albums' },
      ],
    },
    {
      label: '🎬 Film',
      items: [
        { href: '/screen', label: 'The Screen of the Metros' },
        { href: '/screen/rankings', label: 'Rankings by Metro' },
        { href: '/screen/years', label: 'Year by Year' },
        { href: '/screen/number-ones', label: 'US Number Ones' },
        { href: '/screen/oscars', label: 'Oscar Winners' },
        { href: '/screen/canon', label: '500 Greatest Films' },
      ],
    },
  ];

  return [
    { kind: 'group', id: 'geography', label: 'Geography', groups: geography },
    { kind: 'group', id: 'sports', label: 'Sports', groups: sports },
    { kind: 'group', id: 'culture', label: 'Culture', groups: culture },
    {
      kind: 'group', id: 'business', label: 'Business',
      groups: [
        {
          label: '💼 Money',
          items: [
            { href: '/business', label: 'Business of the Metros' },
            { href: '/business/companies', label: 'Companies' },
            { href: '/business/private', label: 'Private & Unicorns' },
            { href: '/business/sp500', label: 'S&P 500' },
            { href: '/business/owners', label: 'Owners' },
            { href: '/business/markets', label: 'Markets' },
            { href: '/business/currencies', label: 'Currencies' },
            { href: '/business/leaders', label: 'Leaders' },
            { href: '/business/crossovers', label: 'Crossovers' },
            { href: '/billionaires', label: 'Billionaires' },
          ],
        },
      ],
    },
    { kind: 'group', id: 'deepdives', label: 'Deep Dives', groups: deepDives },
    { kind: 'group', id: 'play', label: 'Play', groups: play },
    { kind: 'group', id: 'about', label: 'About', groups: about },
    { kind: 'link', href: '/updates', label: 'Release notes' },
  ];
}

export default function MobileMenu({ updated }: { updated: string | null }) {
  const [open, setOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const sections = buildSections();

  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const closePanel = () => setOpen(false);

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
            <a href="/me" onClick={closePanel} className="block rounded-md px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors">★ Following</a>
            {sections.map((s) => {
              if (s.kind === 'link') {
                return (
                  <a
                    key={s.href}
                    href={s.href}
                    target={s.external ? '_blank' : undefined}
                    rel={s.external ? 'noopener noreferrer' : undefined}
                    onClick={closePanel}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                  >
                    {s.label}
                  </a>
                );
              }
              const isOpen = !!openSections[s.id];
              return (
                <div key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                  >
                    <span>{s.label}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="pb-1 pl-2">
                      {s.groups.map((g, gi) => (
                        <div key={gi}>
                          {g.label ? (
                            <div
                              className="text-[11px] uppercase tracking-wider mt-2 mb-0.5 px-3"
                              style={{ color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}
                            >
                              {g.label}
                            </div>
                          ) : null}
                          {g.items.map((it) => {
                            const dot = leafDotColor(it);
                            return (
                              <a
                                key={it.href}
                                href={it.href}
                                target={it.external ? '_blank' : undefined}
                                rel={it.external ? 'noopener noreferrer' : undefined}
                                onClick={closePanel}
                                className="block rounded-md px-3 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
                              >
                                <div className="text-sm text-[var(--text)] flex items-center gap-2">
                                  {dot ? (
                                    <span className="inline-block rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: dot }} aria-hidden="true" />
                                  ) : null}
                                  <span>
                                    {it.label}
                                    {it.external ? (
                                      <span className="ml-1 text-[var(--text-dim)]" aria-hidden="true">↗</span>
                                    ) : null}
                                  </span>
                                </div>
                                {it.hint ? (
                                  <div className="text-xs mt-0.5 pl-0" style={{ color: 'var(--text-muted)' }}>{it.hint}</div>
                                ) : null}
                              </a>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {updated ? (
              <div
                className="mt-3 pt-3 border-t text-xs text-[var(--text-muted)] px-3"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
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