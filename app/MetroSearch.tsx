'use client';

// Compact search-with-autocomplete used on the home console. Keeps a slim
// SearchEntry shape in memory so the full metros.json never crosses to the
// client. Result rows link to /rankings/{slug} and surface rank + tier + score
// inline so a reader can decide whether to click. Matches against metro name,
// primary city, country, and slug; debounced through a controlled input.

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';

export type SearchEntry = {
  rank: number;
  slug: string;
  name: string;
  country: string;
  primaryCity?: string;
  score: number;
  tierName: string;
};

interface Props {
  entries: SearchEntry[];
  maxResults?: number;
}

export default function MetroSearch({ entries, maxResults = 6 }: Props) {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Case-insensitive contains across name / primary city / country / slug.
  // Ranked: exact-prefix on name wins, then prefix on primaryCity, then
  // anywhere-substring, then by metro rank ascending so top metros surface
  // for common queries like "london".
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const scored = entries
      .map((e) => {
        const name = e.name.toLowerCase();
        const city = (e.primaryCity ?? '').toLowerCase();
        const country = e.country.toLowerCase();
        const slug = e.slug.toLowerCase();
        let score = 0;
        if (name.startsWith(term)) score = 1000;
        else if (city.startsWith(term)) score = 900;
        else if (slug.startsWith(term)) score = 850;
        else if (name.includes(term)) score = 500;
        else if (city.includes(term)) score = 400;
        else if (country.includes(term)) score = 200;
        else if (slug.includes(term)) score = 100;
        else return null;
        // Tie-break by rank ascending (lower rank wins).
        return { e, score: score - e.rank * 0.001 };
      })
      .filter((x): x is { e: SearchEntry; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((x) => x.e);
    return scored;
  }, [q, entries, maxResults]);

  // Reset active row when results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  // Global / shortcut: hitting `/` focuses the input. Standard discovery
  // primitive that keyboard users expect on lookup-first sites.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === '/' && document.activeElement !== inputRef.current) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          ev.preventDefault();
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (ev.key === 'Enter') {
      const r = results[activeIdx];
      if (r) {
        window.location.href = `/rankings/${r.slug}`;
      }
    } else if (ev.key === 'Escape') {
      setQ('');
      inputRef.current?.blur();
    }
  };

  const showDropdown = focused && results.length > 0;

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-3 h-10 rounded-md border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{ color: 'var(--text-muted)' }}
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Find a metro"
          aria-label="Search metros by name, primary city, or country"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text)' }}
        />
        <kbd
          className="text-[10px] px-1.5 py-0.5 rounded border hidden sm:inline-block"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          /
        </kbd>
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 mt-1 z-30 rounded-md border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {results.map((r, i) => (
            <Link
              key={r.slug}
              href={`/rankings/${r.slug}`}
              className="block px-3 py-2 transition-colors"
              style={{
                backgroundColor:
                  i === activeIdx ? 'var(--bg-hover, rgba(255,255,255,0.04))' : 'transparent',
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {r.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {r.country}
                  </div>
                </div>
                <div
                  className="text-xs whitespace-nowrap"
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  #{r.rank} · {r.tierName} · {r.score.toFixed(1)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
