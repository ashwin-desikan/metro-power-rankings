'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface PickerMetro {
  slug: string;
  name: string;
  country: string;
  rank: number;
}

interface MetroPickerProps {
  allMetros: PickerMetro[];
  selectedSlugs: string[];
  maxSelected?: number;
}

export default function MetroPicker({
  allMetros,
  selectedSlugs,
  maxSelected = 4,
}: MetroPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedMetros = useMemo(() => {
    const bySlug = new Map(allMetros.map((m) => [m.slug, m]));
    return selectedSlugs
      .map((slug) => bySlug.get(slug))
      .filter((m): m is PickerMetro => Boolean(m));
  }, [allMetros, selectedSlugs]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const selectedSet = new Set(selectedSlugs);
    return allMetros
      .filter((m) => !selectedSet.has(m.slug))
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.country.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [allMetros, selectedSlugs, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function updateSelection(nextSlugs: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('m');
    for (const slug of nextSlugs) {
      params.append('m', slug);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function addMetro(slug: string) {
    if (selectedSlugs.includes(slug)) return;
    if (selectedSlugs.length >= maxSelected) return;
    updateSelection([...selectedSlugs, slug]);
    setQuery('');
    setOpen(false);
  }

  function removeMetro(slug: string) {
    updateSelection(selectedSlugs.filter((s) => s !== slug));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const atCapacity = selectedSlugs.length >= maxSelected;

  return (
    <div
      ref={wrapperRef}
      className="rounded-lg border p-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {selectedMetros.map((m) => (
          <span
            key={m.slug}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg)',
            }}
          >
            <span className="font-medium">{m.name}</span>
            <span className="text-[var(--text-muted)] text-xs">#{m.rank}</span>
            <button
              type="button"
              onClick={() => removeMetro(m.slug)}
              aria-label={`Remove ${m.name}`}
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition"
            >
              &times;
            </button>
          </span>
        ))}
        {selectedMetros.length === 0 && (
          <span className="text-sm text-[var(--text-muted)]">
            No metros selected.
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={
              atCapacity
                ? `Maximum ${maxSelected} metros. Remove one to add another.`
                : 'Add a metro (search by name or country)'
            }
            disabled={atCapacity}
            className="w-full px-3 py-2 rounded border text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          />
          {open && suggestions.length > 0 && (
            <ul
              className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-auto rounded border shadow-lg"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              {suggestions.map((m) => (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => addMetro(m.slug)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-card-hover)] transition flex items-center justify-between"
                  >
                    <span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[var(--text-muted)] ml-2">
                        {m.country}
                      </span>
                    </span>
                    <span
                      className="text-xs text-[var(--text-muted)]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      #{m.rank}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="px-4 py-2 rounded border text-sm hover:border-[var(--accent)] transition whitespace-nowrap"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
