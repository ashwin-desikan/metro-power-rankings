"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { MONO, TH, THR } from "@/app/predictions/_shared/ui";
import { CappedList } from "@/app/_shared/Disclosure";
import { TableScroll } from "@/app/_shared/TableScroll";
import type { NextConfidence } from "@/lib/electionHubsMeta";

// The /elections landing page's "Hubs by region" directory. Client-side
// (sortable headers, region filter chips) receiving plain, fully-computed
// row data from page.tsx - every join that needs a server-only module
// (the census, HUB_COUNTRY_SLUGS, the current-leader overlay, the country
// power ranking) happens there and crosses the boundary as data, never as
// an import, so this file can stay a client component.
//
// The US, UK and EU are pinned at the top, in that order, always - whatever
// sort or region filter is active. Every other hub's DEFAULT order (before
// any header is clicked) is the site's own country power ranking, ascending;
// a hub with no ranked country (the Vatican) sorts alphabetically after every
// ranked one. `rows` arrives in exactly that order, with `pinned` marking the
// three that never move and never resort.

export type DirRow = {
  code: string;
  name: string;
  flagSrc: string;
  flagSrcSet: string;
  href: string;
  region: string;
  systemLabel: string;
  last: string;
  lastYear: number | null;
  next: string;
  nextDate: string | null;
  confidence: NextConfidence;
  leader: { name: string; title: string; href: string } | null;
  contests: number | null;
  /** The country power index rank (ascending = more powerful; the Countries
   *  hub's score rank when the Power Atlas does not score the polity), or
   *  null when the hub has no joinable country row. The default order. */
  rank: number | null;
  /** Share of world power today from the Power Atlas, with rank and tier. */
  power: { share: number | null; rank: number; tier: string } | null;
  note: string | null;
  noteTone: "neutral" | null;
  blurb?: string;
  pinned: boolean;
};

const REGION_OPTIONS = ["Europe", "Asia & Oceania", "Middle East & Africa", "The Americas"];

type SortKey = "rank" | "name" | "power" | "region" | "system" | "last" | "next" | "leader" | "contests";
type SortDir = "asc" | "desc";

// Widths are fixed so the columns hold their shape whatever the sort: with
// auto layout "Next" took a third of the table and "Region" was cut to 95px,
// which truncated "Middle East & Africa" (Ashwin, 2026-09-07).
const COLUMNS: { key: SortKey; label: string; align?: "right"; width: string; nowrap?: boolean }[] = [
  { key: "name", label: "Polity", width: "21%" },
  { key: "power", label: "Power", align: "right", width: "8%" },
  { key: "region", label: "Region", width: "13%", nowrap: true },
  { key: "system", label: "System", width: "11%", nowrap: true },
  { key: "last", label: "Last held", width: "15%" },
  { key: "next", label: "Next", width: "16%" },
  { key: "leader", label: "Head of government", width: "10%" },
  { key: "contests", label: "Contests", align: "right", width: "6%" },
];
const TIER_COLOR: Record<string, string> = {
  "Superpower": "#f5c518", "Great Power": "#e8833a", "Middle Power": "#4a9edb", "Regional": "#7a8a99", "Minor": "#464659",
};
function PowerCell({ power }: { power: DirRow["power"] }) {
  if (!power || power.share == null) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums" title={`${power.tier} · world rank #${power.rank}`}>
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TIER_COLOR[power.tier] ?? "var(--text-dim)" }} />
      <span style={{ color: "var(--accent)" }}>{(power.share * 100).toFixed(1)}%</span>
    </span>
  );
}
const SORT_LABEL: Record<SortKey, string> = {
  rank: "Default (power ranking)",
  power: "Power",
  name: "Polity",
  region: "Region",
  system: "System",
  last: "Last held",
  next: "Next",
  leader: "Head of government",
  contests: "Contests",
};

function cmpNullNum(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}
function cmpNullStr(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a === b ? 0 : a < b ? -1 : 1;
}
function cmpNullName(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

function compareRows(a: DirRow, b: DirRow, key: SortKey, dir: SortDir): number {
  const d = dir === "asc" ? 1 : -1;
  let primary: number;
  switch (key) {
    case "rank": primary = cmpNullNum(a.rank, b.rank); break;
    case "power": primary = -cmpNullNum(a.power?.share ?? null, b.power?.share ?? null); break;
    case "name": return d * a.name.localeCompare(b.name);
    case "region": primary = a.region.localeCompare(b.region); break;
    case "system": primary = a.systemLabel.localeCompare(b.systemLabel); break;
    case "last": primary = cmpNullNum(a.lastYear, b.lastYear); break;
    case "next": primary = cmpNullStr(a.nextDate, b.nextDate); break;
    case "leader": primary = cmpNullName(a.leader?.name ?? null, b.leader?.name ?? null); break;
    case "contests": primary = cmpNullNum(a.contests, b.contests); break;
  }
  return d * primary || a.name.localeCompare(b.name);
}

function badgeFor(confidence: DirRow["confidence"]): { label: string; color: string } {
  if (confidence === "confirmed") return { label: "Set", color: "#4ECDC4" };
  if (confidence === "expected") return { label: "Term running", color: "var(--text-dim)" };
  if (confidence === "dissolved") return { label: "Dissolved", color: "var(--text-dim)" };
  return { label: "No date", color: "var(--text-dim)" };
}

// Region filter chip - same idiom as HubIndex.tsx's Chip: pill button,
// aria-pressed, 44px tall.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        backgroundColor: "var(--bg-card)",
      }}
    >
      {children}
    </button>
  );
}

function toggleInSet<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function NoteBadge({ row }: { row: DirRow }) {
  if (!row.note) return null;
  return (
    <span
      className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={row.noteTone === "neutral"
        ? { borderColor: "var(--border)", color: "var(--text-muted)" }
        : { borderColor: "#B4540A", color: "#D97706" }}
    >
      {row.note}
    </span>
  );
}

function Flag({ row }: { row: DirRow }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.flagSrc}
      srcSet={row.flagSrcSet}
      alt=""
      width={20}
      height={15}
      className="rounded-[2px] border shrink-0"
      style={{ borderColor: "var(--border)" }}
    />
  );
}

function DesktopRow({ row }: { row: DirRow }) {
  const badge = badgeFor(row.confidence);
  return (
    <tr className="border-b last:border-0 hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
      <td className="px-3 py-1.5">
        {/* The name never yields to the badge: a truncating name beside a
            shrink-0 badge collapsed to nothing on the managed systems, so
            China and Russia showed as a flag and a tag (Ashwin, 2026-09-07).
            The name is nowrap and the badge wraps under it when the cell is
            narrow. */}
        <Link href={row.href} title={row.blurb} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-[var(--text)] hover:text-[var(--accent)]">
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Flag row={row} />
            <span>{row.name}</span>
          </span>
          <NoteBadge row={row} />
        </Link>
      </td>
      <td className="px-3 py-1.5 text-right" style={MONO}><PowerCell power={row.power} /></td>
      <td className="hidden md:table-cell px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">{row.region}</td>
      <td className="hidden md:table-cell px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">{row.systemLabel}</td>
      <td className="px-3 py-1.5 text-[var(--text-muted)]">{row.last}</td>
      <td className="px-3 py-1.5 text-[var(--text-muted)]">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
          <span>{row.next}</span>
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
            style={{ ...MONO, color: badge.color, backgroundColor: "var(--bg-card-hover)" }}
          >
            {badge.label}
          </span>
        </span>
      </td>
      <td className="px-3 py-1.5 text-[var(--text-muted)]">
        {row.leader ? (
          <span className="flex flex-col leading-tight">
            <Link href={row.leader.href} className="hover:text-[var(--accent)] hover:underline">
              {row.leader.name}
            </Link>
            {row.leader.title ? <span className="text-[10px] text-[var(--text-dim)]">{row.leader.title}</span> : null}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums" style={MONO}>
        {row.contests ?? "—"}
      </td>
    </tr>
  );
}

function MobileRow({ row }: { row: DirRow }) {
  const badge = badgeFor(row.confidence);
  return (
    <div className="tap-row flex min-h-11 items-center gap-2.5 px-3 py-2">
      <Link href={row.href} title={row.blurb} className="tap-target flex min-w-0 flex-1 items-center gap-2.5">
        <Flag row={row} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
            <span className="font-semibold text-[var(--text)] whitespace-nowrap">{row.name}</span>
            <NoteBadge row={row} />
          </span>
          <span className="flex items-center gap-1.5 min-w-0 mt-0.5">
            <span className="text-xs text-[var(--text-dim)] truncate">
              {row.region} · {row.next}
              {row.leader ? ` · ${row.leader.title ? `${row.leader.title} ` : ""}${row.leader.name}` : ""}
            </span>
            <span
              className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
              style={{ ...MONO, color: badge.color, backgroundColor: "var(--bg-card-hover)" }}
            >
              {badge.label}
            </span>
          </span>
        </span>
      </Link>
      <span className="shrink-0 text-right text-xs" style={MONO}>
        <span className="block"><PowerCell power={row.power} /></span>
        <span className="block text-[10px] text-[var(--text-dim)]">{row.contests != null ? `${row.contests} contests` : ""}</span>
      </span>
    </div>
  );
}

export default function HubDirectory({ rows }: { rows: DirRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [regionF, setRegionF] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setAnnounce(`Sorted by ${SORT_LABEL[key]}`);
  }

  const pinned = useMemo(() => rows.filter((r) => r.pinned), [rows]);
  const rest = useMemo(() => rows.filter((r) => !r.pinned), [rows]);
  const restFiltered = useMemo(
    () => (regionF.size ? rest.filter((r) => regionF.has(r.region)) : rest),
    [rest, regionF],
  );
  const restSorted = useMemo(
    () => [...restFiltered].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [restFiltered, sortKey, sortDir],
  );
  const displayRows = [...pinned, ...restSorted];

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  return (
    <div>
      {/* Region filter chips: multi-select, narrow the ranked/sorted rest of
          the list. The three pinned hubs (US, UK, EU) ignore this filter and
          stay visible at the top regardless. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1 pb-3 sm:px-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1" style={MONO}>Region</span>
        {REGION_OPTIONS.map((r) => (
          <Chip key={r} active={regionF.has(r)} onClick={() => setRegionF((s) => toggleInSet(s, r))}>
            {r}
          </Chip>
        ))}
      </div>

      {/* Sort control for the phone: the same sortKey/sortDir state as the
          desktop table's clickable headers, so every control the table
          offers exists on the phone (DESIGN-STANDARDS section 6). */}
      <div className="flex sm:hidden items-center gap-2 text-xs px-3 pb-3">
        <label className="flex-1 flex items-center gap-2 min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => toggleSort(e.target.value as SortKey)}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {(["rank", ...COLUMNS.map((c) => c.key)] as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0 min-h-11"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Desktop: one flat table, sortable on every column, in the 80vh
          scroll box TableScroll gives every table for free. */}
      <div className="hidden sm:block">
        <TableScroll className="rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={`${c.align === "right" ? THR : TH} ${c.key === "region" || c.key === "system" ? "hidden md:table-cell" : ""}`}
                    aria-sort={ariaSort(c.key)}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 font-semibold hover:text-[var(--accent)] ${c.align === "right" ? "justify-end w-full" : ""}`}
                    >
                      {c.label}{sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => <DesktopRow key={r.code} row={r} />)}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {/* Phone: pinned rows always first, then the filtered/sorted rest,
          capped and keyed on filter + sort state per DESIGN-STANDARDS
          section 2 ("reset the cap when the list changes"). */}
      <div className="sm:hidden px-3">
        <div className="rounded-xl border divide-y divide-[var(--border)] overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <CappedList
            key={`${sortKey}-${sortDir}-${Array.from(regionF).sort().join(",")}-${displayRows.length}`}
            initial={8}
            noun="hubs"
            bodyClassName="divide-y divide-[var(--border)]"
            items={displayRows.map((r) => <MobileRow key={r.code} row={r} />)}
          />
        </div>
      </div>
    </div>
  );
}
