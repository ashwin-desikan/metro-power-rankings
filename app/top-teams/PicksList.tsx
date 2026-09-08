"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

// Plain, serializable data for one card. Computed server-side in page.tsx
// (resolveTeamLink and slug resolution are server-only), so this client
// component only ever maps data to markup, never fetches or resolves.
export interface TopTeamPartData {
  name: string;
  href: string | null;
  logoUrl: string | null;
}

export interface TopTeamPickData {
  rank: number;
  metro: string;
  metroHref: string | null;
  anchorId: string;
  sportLabel: string;
  isContested: boolean;
  teamParts: TopTeamPartData[];
  rationale: string;
}

const PAGE_SIZE = 40;
const BAND_SIZE = 50;

function TeamPartLink({ part }: { part: TopTeamPartData }) {
  if (part.href) {
    return (
      <Link
        href={part.href}
        className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity"
        style={{ color: "var(--accent)" }}
      >
        {part.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={part.logoUrl}
            alt=""
            width={18}
            height={18}
            className="inline-block flex-shrink-0 object-contain"
            aria-hidden
            loading="lazy"
            decoding="async"
          />
        ) : (
          <CrestIcon name={part.name} size={18} className="flex-shrink-0" />
        )}
        <span>{part.name}</span>
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center" style={{ color: "var(--text)" }}>
      <CrestIcon name={part.name} size={18} className="mr-1.5 align-middle" />
      <span>{part.name}</span>
    </span>
  );
}

function PickCard({ pick }: { pick: TopTeamPickData }) {
  return (
    <article
      id={pick.anchorId}
      className="rounded-lg border p-5 sm:p-6 transition hover:border-[var(--accent)] scroll-mt-24"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <header className="flex items-start gap-4 mb-3 flex-wrap">
        <div
          className="text-xs font-semibold px-2.5 py-1 rounded border whitespace-nowrap"
          style={{ color: "var(--accent)", borderColor: "var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          #{pick.rank}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight leading-snug" style={{ color: "var(--text)" }}>
            {pick.metroHref ? (
              <Link href={pick.metroHref} className="hover:text-[var(--accent)] transition-colors">
                {pick.metro}
              </Link>
            ) : (
              pick.metro
            )}
          </h3>
          <div className="text-sm mt-1 flex flex-wrap items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold" style={{ color: "var(--text)" }}>
              {pick.teamParts.map((part, idx) => (
                <span key={part.name} className="inline-flex items-center gap-1.5">
                  {idx > 0 ? <span className="text-[var(--text-dim)]">/</span> : null}
                  <TeamPartLink part={part} />
                </span>
              ))}
            </span>
            {pick.sportLabel && (
              <span
                className="inline-block text-[10px] uppercase tracking-widest border rounded px-2 py-0.5"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                {pick.sportLabel}
              </span>
            )}
            {pick.isContested && (
              <span
                className="inline-block text-[10px] uppercase tracking-widest border rounded px-2 py-0.5"
                style={{ borderColor: "var(--accent)", color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                Co-equal
              </span>
            )}
          </div>
        </div>
      </header>
      {pick.rationale && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          {pick.rationale}
        </p>
      )}
    </article>
  );
}

export default function PicksList({ picks }: { picks: TopTeamPickData[] }) {
  const total = picks.length;
  const [visibleCount, setVisibleCount] = useState(Math.min(PAGE_SIZE, total));
  const pendingScrollId = useRef<string | null>(null);

  const anchorIndex = useMemo(() => {
    const m = new Map<string, number>();
    picks.forEach((p, i) => m.set(p.anchorId, i));
    return m;
  }, [picks]);

  // Expand the visible window to include a deep-linked card, then scroll to
  // it. Runs on mount and on every hashchange, so links from other pages
  // (resolveTeamLink pages, /rankings/[slug]) that point at #anchor keep
  // working once the list is paged.
  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const idx = anchorIndex.get(hash);
      if (idx === undefined) return;
      pendingScrollId.current = hash;
      setVisibleCount((v) => (idx < v ? v : Math.min(total, idx + 1)));
    }
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorIndex, total]);

  useEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      pendingScrollId.current = null;
    }
  }, [visibleCount]);

  const bands = useMemo(() => {
    const list: { label: string; startIndex: number }[] = [];
    for (let i = 0; i < total; i += BAND_SIZE) {
      const end = Math.min(i + BAND_SIZE, total);
      list.push({ label: `${i + 1} to ${end}`, startIndex: i });
    }
    return list;
  }, [total]);

  function jumpToBand(startIndex: number) {
    const target = picks[startIndex];
    if (!target) return;
    pendingScrollId.current = target.anchorId;
    setVisibleCount((v) => Math.max(v, Math.min(total, startIndex + BAND_SIZE)));
    // If the band is already visible, the visibleCount effect above won't
    // re-fire (state unchanged), so scroll directly in that case.
    if (startIndex + 1 <= visibleCount) {
      requestAnimationFrame(() => {
        const el = document.getElementById(target.anchorId);
        if (el) el.scrollIntoView({ block: "start" });
        pendingScrollId.current = null;
      });
    }
  }

  const remaining = total - visibleCount;

  return (
    <div>
      {bands.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6" role="navigation" aria-label="Jump to rank band">
          {bands.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => jumpToBand(b.startIndex)}
              className="min-h-[44px] inline-flex items-center rounded border px-3 text-xs font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5">
        {picks.slice(0, visibleCount).map((pick) => (
          <PickCard key={pick.anchorId} pick={pick} />
        ))}
      </div>

      {remaining > 0 && (
        <div className="flex flex-wrap gap-3 mt-8">
          <button
            type="button"
            onClick={() => setVisibleCount((v) => Math.min(total, v + PAGE_SIZE))}
            className="min-h-[44px] inline-flex items-center rounded border px-4 text-sm font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--text)", backgroundColor: "var(--bg-card)" }}
          >
            Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} left)
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount(total)}
            className="min-h-[44px] inline-flex items-center rounded border px-4 text-sm font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
