"use client";

// Filterable, sortable metros list for a country page.
//
// The United States tracks 596 metros, Russia 271, Brazil 218. Rendering that
// as one static rank-ordered list means the only way to find a metro is to
// scroll, and the only available question is "what is the order the ETL chose".
// A filter plus three sorts turns it into something you can interrogate.
//
// Client component, so props are plain serialisable data only: the row shape is
// declared structurally below rather than imported, and the capital / largest
// tests arrive as strings instead of the page's closures over `country`.
// @/lib/tiers and @/lib/shared are pure (no fs), so they are safe here and are
// not on the SERVER_ONLY_MODULES list in scripts/check-client-imports.mjs.

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop } from "@/lib/shared";

export type ExplorerMetro = {
  slug: string;
  name: string;
  rank: number;
  pop: number;
  score: number;
  primaryState?: string | null;
  stateSlug?: string | null;
  state2?: string | null;
  state2Slug?: string | null;
  state3?: string | null;
  state3Slug?: string | null;
  additionalStates?: { name: string; slug?: string }[] | null;
};

type SortKey = "rank" | "pop" | "score";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function statesOf(m: ExplorerMetro): { name: string; slug?: string }[] {
  return [
    m.state2 ? { name: m.state2, slug: m.state2Slug ?? undefined } : null,
    m.state3 ? { name: m.state3, slug: m.state3Slug ?? undefined } : null,
    ...(m.additionalStates ?? []),
  ].filter((s): s is { name: string; slug?: string } => s != null);
}

// Copied verbatim from the previous inline markup in page.tsx so the badges
// keep their existing look. Do not restyle here in isolation.
function CapitalBadge() {
  return (
    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#f59e0b", ...MONO }}
          title="National capital">★ Capital</span>
  );
}

function LargestBadge() {
  return (
    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(96, 165, 250, 0.18)", color: "#60a5fa", ...MONO }}
          title="Largest metro by population">▲ Largest</span>
  );
}

function SortHeader({
  label, k, sort, dir, onSort, className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const on = sort === k;
  return (
    <th className={className} aria-sort={on ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text)] transition-colors"
        style={{ color: on ? "var(--text)" : undefined }}
      >
        {label}
        <span aria-hidden className="text-[9px]">{on ? (dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}


export default function MetrosExplorer({
  metros, capital, biggestMetro,
}: {
  metros: ExplorerMetro[];
  capital?: string | null;
  biggestMetro?: string | null;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  // Rank reads best ascending (#1 first); population and score read best
  // descending (biggest first). Clicking the active header flips it.
  const [dir, setDir] = useState<1 | -1>(1);

  const onSort = (k: SortKey) => {
    if (k === sort) { setDir((d) => (d === 1 ? -1 : 1)); return; }
    setSort(k);
    setDir(k === "rank" ? 1 : -1);
  };

  const isCapital = (n: string) => capital != null && n === capital;
  const isLargest = (n: string) => biggestMetro != null && n === biggestMetro;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? metros.filter((m) => {
          if (m.name.toLowerCase().includes(needle)) return true;
          if (m.primaryState && m.primaryState.toLowerCase().includes(needle)) return true;
          return statesOf(m).some((s) => s.name.toLowerCase().includes(needle));
        })
      : metros;
    const out = [...filtered];
    out.sort((a, b) => {
      const av = sort === "rank" ? a.rank : sort === "pop" ? a.pop : a.score;
      const bv = sort === "rank" ? b.rank : sort === "pop" ? b.pop : b.score;
      if (av === bv) return a.rank - b.rank;   // stable, meaningful tiebreak
      return av < bv ? -dir : dir;
    });
    return out;
  }, [metros, q, sort, dir]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by metro or state..."
          aria-label="Filter metros by name or state"
          className="min-w-0 flex-1 sm:flex-none sm:w-72 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--text-dim)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <span className="text-xs text-[var(--text-dim)] whitespace-nowrap" style={MONO}>
          {shown.length === metros.length
            ? `${metros.length.toLocaleString()} metros`
            : `${shown.length.toLocaleString()} of ${metros.length.toLocaleString()}`}
        </span>
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline"
          >
            clear
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div
          className="border rounded-lg p-8 text-center"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--text-muted)]">No metro matches “{q}”.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden min-w-0" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden divide-y divide-[var(--border)]">
            {shown.map((m) => {
              const tier = computeTier(m.score);
              const extra = statesOf(m);
              return (
                <div key={`${m.slug}-card`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs text-[var(--text-dim)] tabular-nums mr-1.5" style={MONO}>#{m.rank}</span>
                      <Link href={`/rankings/${m.slug}`} className="font-semibold hover:text-[var(--accent)]">{m.name}</Link>
                      {isCapital(m.name) ? <CapitalBadge /> : null}
                      {isLargest(m.name) ? <LargestBadge /> : null}
                    </div>
                    <span className="flex-shrink-0 font-bold tabular-nums" style={{ ...MONO, color: "var(--accent)" }}>{m.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span className="tabular-nums" style={MONO}>{formatPop(m.pop)}</span>
                    <Link href={`/methodology${tierAnchor(m.score)}`} className="hover:text-[var(--accent)]" style={MONO}>{tier.name}</Link>
                  </div>
                  {(m.primaryState || extra.length > 0) ? (
                    <div className="mt-1 text-xs text-[var(--text-dim)]">
                      {m.primaryState ? (
                        m.stateSlug ? (
                          <Link href={`/states/${m.stateSlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)]">{m.primaryState}</Link>
                        ) : (
                          <span className="text-[var(--text-muted)]">{m.primaryState}</span>
                        )
                      ) : null}
                      {extra.map((s, idx) => (
                        <span key={`${s.name}-${idx}`}>
                          {(m.primaryState || idx > 0) ? " · " : ""}
                          {s.slug ? (
                            <Link href={`/states/${s.slug}`} className="hover:text-[var(--accent)]">{s.name}</Link>
                          ) : (
                            <span>{s.name}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Desktop: table. Stays a DIRECT child of the scroll wrapper per
              DESIGN-STANDARDS; first header is "Rank", not "#", so rule 2 of
              check:table-scroll does not apply. Do not rename it to "#"
              without adding data-sticky-col="2". */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-dim)] uppercase tracking-wider"
                    style={{ borderBottom: "1px solid var(--border)", ...MONO }}>
                  <SortHeader label="Rank" k="rank" sort={sort} dir={dir} onSort={onSort} className="py-2 pl-4 pr-4" />
                  <th className="py-2 pr-4">Metro</th>
                  <th className="hidden md:table-cell py-2 pr-4">State</th>
                  <SortHeader label="Population" k="pop" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell py-2 pr-4 text-right" />
                  <SortHeader label="Score" k="score" sort={sort} dir={dir} onSort={onSort} className="py-2 pr-4 text-right" />
                  <th className="py-2 pr-4 text-right">Tier</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const tier = computeTier(m.score);
                  const extra = statesOf(m);
                  return (
                    <tr key={m.slug} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-3 pl-4 pr-4 text-xs text-[var(--text-dim)]" style={MONO}>#{m.rank}</td>
                      <td className="py-3 pr-4">
                        <Link href={`/rankings/${m.slug}`} className="font-semibold hover:text-[var(--accent)]">{m.name}</Link>
                        {isCapital(m.name) ? <CapitalBadge /> : null}
                        {isLargest(m.name) ? <LargestBadge /> : null}
                      </td>
                      <td className="hidden md:table-cell py-3 pr-4 text-xs">
                        {m.primaryState ? (
                          m.stateSlug ? (
                            <Link href={`/states/${m.stateSlug}`} className="text-[var(--text)] hover:text-[var(--accent)]">{m.primaryState}</Link>
                          ) : (
                            <span className="text-[var(--text)]">{m.primaryState}</span>
                          )
                        ) : (
                          <span className="text-[var(--text-dim)]">—</span>
                        )}
                        {extra.length > 0 ? (
                          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                            {extra.map((s, idx, arr) => (
                              <span key={`${s.name}-${idx}`}>
                                {s.slug ? (
                                  <Link href={`/states/${s.slug}`} className="hover:text-[var(--accent)]">{s.name}</Link>
                                ) : (
                                  <span>{s.name}</span>
                                )}
                                {idx < arr.length - 1 ? <span> · </span> : null}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="hidden sm:table-cell py-3 pr-4 text-right text-[var(--text-muted)]" style={MONO}>{formatPop(m.pop)}</td>
                      <td className="py-3 pr-4 text-right font-bold" style={{ ...MONO, color: "var(--accent)" }}>{m.score.toFixed(1)}</td>
                      <td className="py-3 pr-4 text-right text-xs" style={{ ...MONO, color: "var(--text-muted)" }}>
                        <Link href={`/methodology${tierAnchor(m.score)}`} className="hover:text-[var(--accent)]">{tier.name}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
