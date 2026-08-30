"use client";

// Sortable index of every nation to appear at the FIFA Women's World Cup.
// Server passes the nations (already ranked by honors); clicking a header
// re-sorts in the browser. Default order is the honors ranking.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { WWCNation } from "@/lib/wnational";
import { flagCdnUrl } from "@/lib/international-display";
import { CappedList } from "@/app/_shared/Disclosure";

type SortKey = "default" | "nation" | "continent" | "apps" | "titles" | "finals" | "best" | "last";
type SortDir = "asc" | "desc";
const TEXT = new Set<SortKey>(["nation", "continent"]);

function Th({ label, k, active, dir, align, onSort, className }: {
  label: string; k: SortKey; active: boolean; dir: SortDir; align: "left" | "right"; onSort: (k: SortKey) => void; className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={`py-2 px-2 font-medium whitespace-nowrap align-bottom ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 py-1.5 hover:text-[var(--accent)] transition" style={{ color: active ? "var(--accent)" : "inherit", fontWeight: "inherit" }} title={`Sort by ${label}`}>
        <span>{label}</span><span className="text-[10px] opacity-70" aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

// National-team flag, shared by the mobile card and desktop table so the
// flagcdn lookup and fallback (no image for unmapped slugs) stay in one place.
function NationFlag({ slug }: { slug: string }) {
  const url = flagCdnUrl(slug);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      width={18}
      height={13}
      className="inline-block rounded-sm object-contain flex-shrink-0 align-middle"
      loading="lazy"
      decoding="async"
    />
  );
}

export default function WWCNationsTable({ nations }: { nations: WWCNation[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [announce, setAnnounce] = useState("");

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "best" || TEXT.has(k) ? "asc" : "desc"); }
  }

  const sorted = useMemo(() => {
    const arr = [...nations];
    const m = sortDir === "asc" ? 1 : -1;
    const honors = (n: WWCNation) => [-n.titles, -n.finals, n.best_rank, -n.appearances];
    arr.sort((a, b) => {
      if (sortKey === "default") {
        const ha = honors(a), hb = honors(b);
        for (let i = 0; i < ha.length; i++) if (ha[i] !== hb[i]) return (ha[i] - hb[i]) * m;
        return a.name.localeCompare(b.name);
      }
      if (sortKey === "nation") return a.name.localeCompare(b.name) * m;
      if (sortKey === "continent") return ((a.continent ?? "").localeCompare(b.continent ?? "") || a.name.localeCompare(b.name)) * m;
      if (sortKey === "best") return (a.best_rank - b.best_rank) * m || -(a.titles - b.titles);
      const val = (n: WWCNation) => sortKey === "apps" ? n.appearances : sortKey === "titles" ? n.titles : sortKey === "finals" ? n.finals : (n.last_appearance ?? 0);
      return (val(a) - val(b)) * m || -(a.titles - b.titles) || a.name.localeCompare(b.name);
    });
    return arr;
  }, [nations, sortKey, sortDir]);

  const num = (n: number) => (n > 0 ? n : <span className="text-[var(--text-dim)]">—</span>);

  return (
    <section className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-base font-semibold">All nations</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Every nation to reach a Women&apos;s World Cup, by honors. Click any column to sort.</p>

      {/* Mobile sort control: the desktop Th buttons (onClick={() => onSort(k)})
          live only in the table below, hidden below sm, so cards need their own
          way to drive the same sortKey/sortDir state. */}
      <div
        className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 mt-4 sm:hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              onSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="default" disabled>Honors (default)</option>
            <option value="nation">Nation</option>
            <option value="continent">Confed.</option>
            <option value="apps">Apps</option>
            <option value="titles">Titles</option>
            <option value="finals">Finals</option>
            <option value="best">Best</option>
            <option value="last">Last</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            onSort(sortKey);
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: one card per nation instead of an 8-column table that would
          otherwise need horizontal scrolling or silently hidden columns.
          Same `sorted` data/state as the desktop table below. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="nations"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={sorted.map((n, i) => (
          <div
            key={`${n.slug}-card`}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0">{i + 1}</span>
                <NationFlag slug={n.slug} />
                <Link href={`/teams/national/womens-world-cup/${n.slug}`} className="font-medium hover:underline truncate">
                  {n.name}
                </Link>
              </div>
              {n.continent && (
                <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)]">{n.continent}</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Apps</div>
                <div className="tabular-nums">{n.appearances}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                <div className="tabular-nums font-semibold">{num(n.titles)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Finals</div>
                <div className="tabular-nums">{num(n.finals)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Best</div>
                <div className="whitespace-nowrap">{n.best_finish ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Last</div>
                <div className="tabular-nums">{n.last_appearance ?? <span className="text-[var(--text-dim)]">—</span>}</div>
              </div>
            </div>
          </div>
        ))}
        />
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pr-2 text-right font-medium w-10 align-bottom">#</th>
              <Th label="Nation" k="nation" active={sortKey === "nation"} dir={sortDir} align="left" onSort={onSort} />
              <Th label="Confed." k="continent" active={sortKey === "continent"} dir={sortDir} align="left" onSort={onSort} className="hidden md:table-cell" />
              <Th label="Apps" k="apps" active={sortKey === "apps"} dir={sortDir} align="right" onSort={onSort} />
              <Th label="Titles" k="titles" active={sortKey === "titles"} dir={sortDir} align="right" onSort={onSort} />
              <Th label="Finals" k="finals" active={sortKey === "finals"} dir={sortDir} align="right" onSort={onSort} />
              <Th label="Best" k="best" active={sortKey === "best"} dir={sortDir} align="left" onSort={onSort} className="hidden sm:table-cell" />
              <Th label="Last" k="last" active={sortKey === "last"} dir={sortDir} align="right" onSort={onSort} className="hidden sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((n, i) => (
              <tr key={n.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <span className="inline-flex items-center gap-1.5">
                    <NationFlag slug={n.slug} />
                    <Link href={`/teams/national/womens-world-cup/${n.slug}`} className="hover:underline font-medium">{n.name}</Link>
                  </span>
                </td>
                <td className="py-1.5 px-2 hidden md:table-cell text-[var(--text-muted)]">{n.continent ?? <span className="text-[var(--text-dim)]">—</span>}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{n.appearances}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{num(n.titles)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{num(n.finals)}</td>
                <td className="py-1.5 px-2 hidden sm:table-cell text-[var(--text-muted)] whitespace-nowrap">{n.best_finish ?? "—"}</td>
                <td className="py-1.5 px-2 text-right tabular-nums hidden sm:table-cell">{n.last_appearance ?? <span className="text-[var(--text-dim)]">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
