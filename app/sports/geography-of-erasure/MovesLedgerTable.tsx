"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CappedList } from "@/app/_shared/Disclosure";
import { leagueLabel, type Move } from "@/lib/movesShared";

type SortKey = "year" | "league" | "franchise" | "distance";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function dash(v: number | null | undefined): string {
  return v == null ? "—" : String(v);
}

function MetroLink({ metro, slug }: { metro: string; slug: string | null }) {
  if (!slug) return <span>{metro}</span>;
  return (
    <Link href={`/rankings/${slug}`} className="hover:text-[var(--accent)] hover:underline">
      {metro}
    </Link>
  );
}

// "via Memphis (1 season)" - a stopover collapsed into this move, shown
// under To rather than as its own row (the ledger's unit is the move from
// origin to final home, not every stint in between).
function ViaLine({ via }: { via: Move["via"] }) {
  if (!via || via.length === 0) return null;
  return (
    <div className="text-xs text-[var(--text-dim)] mt-0.5">
      via {via.map((v, i) => (
        <span key={v.metro_slug ?? v.metro}>
          {i > 0 ? ", " : ""}
          <MetroLink metro={v.metro} slug={v.metro_slug} /> ({v.seasons} season{v.seasons === 1 ? "" : "s"})
        </span>
      ))}
    </div>
  );
}

export default function MovesLedgerTable({ moves }: { moves: Move[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("year");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [announce, setAnnounce] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "franchise" || key === "league" ? "asc" : "desc"); }
  }
  function arrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  const sorted = useMemo(() => {
    const list = [...moves];
    list.sort((a, b) => {
      let c = 0;
      if (sortKey === "year") c = a.year - b.year;
      else if (sortKey === "league") c = leagueLabel(a.league).localeCompare(leagueLabel(b.league));
      else if (sortKey === "franchise") c = a.franchise_now.localeCompare(b.franchise_now);
      else if (sortKey === "distance") c = (a.distance_km ?? -1) - (b.distance_km ?? -1);
      if (c === 0) c = a.year - b.year;
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [moves, sortKey, sortDir]);

  const selectCls =
    "px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)]";

  return (
    <div>
      {/* Mobile sort control - same idiom as app/leaders/LeadersDirectory.tsx */}
      <div className="flex items-center gap-2 mb-2 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              toggleSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm`}
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="year">Year</option>
            <option value="league">League</option>
            <option value="franchise">Franchise</option>
            <option value="distance">Distance</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggleSort(sortKey);
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Phone: capped card list */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          key={`ledger-${sortKey}-${sortDir}-${sorted.length}`}
          initial={15}
          noun="moves"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={sorted.map((m, i) => (
            <div
              key={`${m.league}-${m.franchise_slug}-${m.year}-${i}`}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <Link href={m.href} className="font-semibold hover:text-[var(--accent)] transition-colors">
                  {m.franchise_now}
                </Link>
                <span className="text-xs tabular-nums text-[var(--text-dim)]" style={MONO}>{m.year}</span>
              </div>
              <div className="text-xs text-[var(--text-dim)] uppercase tracking-wide mt-0.5">{leagueLabel(m.league)}</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                <MetroLink metro={m.from.metro} slug={m.from.metro_slug} /> <span className="text-[var(--text-dim)]">to</span> <MetroLink metro={m.to.metro} slug={m.to.metro_slug} />
              </div>
              <ViaLine via={m.via} />
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]" style={MONO}>
                <span>{m.distance_km != null ? `${m.distance_km.toLocaleString()} km` : "—"}</span>
                <span>Titles {dash(m.titles_before)}/{dash(m.titles_after)}</span>
                {m.same_metro ? <span className="text-[var(--accent)]">same metro</span> : null}
                {m.returned ? <span className="text-[var(--accent)]">returned</span> : null}
              </div>
            </div>
          ))}
        />
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border min-w-0" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={MONO} onClick={() => toggleSort("year")}>Year{arrow("year")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggleSort("league")}>League{arrow("league")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" onClick={() => toggleSort("franchise")}>Franchise{arrow("franchise")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">From</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">To</th>
              <th className="px-3 py-2 text-right font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]" style={MONO} onClick={() => toggleSort("distance")}>Distance{arrow("distance")}</th>
              <th className="hidden md:table-cell px-3 py-2 text-right font-semibold text-[var(--text-muted)]" style={MONO}>Titles before/after</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={`${m.league}-${m.franchise_slug}-${m.year}-${i}`} className="border-b hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 tabular-nums text-[var(--text-dim)]" style={MONO}>{m.year}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{leagueLabel(m.league)}</td>
                <td className="px-3 py-2">
                  <Link href={m.href} className="hover:text-[var(--accent)] transition-colors font-medium">{m.franchise_now}</Link>
                  {m.returned ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--accent)]">returned</span> : null}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]"><MetroLink metro={m.from.metro} slug={m.from.metro_slug} /></td>
                <td className="px-3 py-2 text-[var(--text-muted)]">
                  <MetroLink metro={m.to.metro} slug={m.to.metro_slug} />
                  {m.same_metro ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">same metro</span> : null}
                  <ViaLine via={m.via} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>
                  {m.distance_km != null ? `${m.distance_km.toLocaleString()} km` : <span className="text-[var(--text-dim)]">—</span>}
                </td>
                <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>
                  {dash(m.titles_before)} / {dash(m.titles_after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-dim)] mt-2">{sorted.length} moves shown.</p>
    </div>
  );
}
