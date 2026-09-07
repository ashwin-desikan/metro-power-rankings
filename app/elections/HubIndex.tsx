"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { MONO, TH, THR, TD, TableBox } from "@/app/business/ui";
import { CappedList } from "@/app/_shared/Disclosure";
import type { GovernmentType } from "@/lib/electionHubsMeta";

// The scaling answer for /elections/all. The landing page's four regional
// columns work at 35 hubs and stop working somewhere well before 80, which is
// where the coverage rule takes this atlas. So: one A-Z / table list, search,
// filter chips and no pagination, everything filtered in the browser off a
// payload the server already had to build.
//
// Deliberately not a fuzzy matcher. Substring on name, code, region and the
// election prose is predictable, and predictable beats clever for a picker
// someone uses once and leaves.

export type Regime = "competitive" | "managed";
export type Horizon = "2026" | "2027" | "later" | "none";

export type HubRow = {
  code: string;
  name: string;
  href: string;
  flagSrc: string;
  flagSrcSet: string;
  region: string;
  last: string;
  next: string;
  nextDate: string | null;
  confidence: "confirmed" | "expected" | "unscheduled";
  daysAway: number | null;
  overdue: boolean;
  contests: number;
  note?: string | null;
  noteTone?: "neutral" | null;
  compact: boolean;
  governmentType: GovernmentType;
  governmentLabel: string;
  familyKey: string;
  familyLabel: string;
  regime: Regime;
  horizon: Horizon;
};

type SortKey = "name" | "next" | "contests" | "system" | "family";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const SYSTEM_OPTIONS: { key: GovernmentType; label: string }[] = [
  { key: "parliamentary", label: "Parliamentary" },
  { key: "presidential", label: "Presidential" },
  { key: "semi-presidential", label: "Semi-presidential" },
  { key: "other", label: "Other" },
];
const REGIME_OPTIONS: { key: Regime; label: string }[] = [
  { key: "competitive", label: "Competitive" },
  { key: "managed", label: "Managed" },
];
const HORIZON_OPTIONS: { key: Horizon; label: string }[] = [
  { key: "2026", label: "Voting in 2026" },
  { key: "2027", label: "Voting in 2027" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
];
const SORT_LABEL: Record<SortKey, string> = {
  name: "A–Z",
  next: "Next to vote",
  contests: "Most contests",
  system: "System",
  family: "Electoral family",
};

function statusOf(c: HubRow["confidence"]): "Set" | "Term running" | "No date" {
  return c === "confirmed" ? "Set" : c === "expected" ? "Term running" : "No date";
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
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

export default function HubIndex({
  rows,
  families,
}: {
  rows: HubRow[];
  families: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [systemF, setSystemF] = useState<Set<GovernmentType>>(new Set());
  const [familyF, setFamilyF] = useState<Set<string>>(new Set());
  const [regimeF, setRegimeF] = useState<Set<Regime>>(new Set());
  const [horizonF, setHorizonF] = useState<Set<Horizon>>(new Set());
  const [announce, setAnnounce] = useState("");

  const familyOptions = useMemo(() => {
    const keys = new Set(rows.map((r) => r.familyKey));
    return Array.from(keys)
      .map((k) => ({ key: k, label: k === "none" ? "Not scored" : (families[k] ?? k) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, families]);

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setSortDir(key === "contests" ? "desc" : "asc");
    }
    setAnnounce(`Sorted by ${SORT_LABEL[key]}`);
  }

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    let hit = needle
      ? rows.filter((r) =>
          [r.name, r.code, r.region, r.last, r.next].some((f) => norm(f).includes(needle)),
        )
      : rows;
    if (systemF.size) hit = hit.filter((r) => systemF.has(r.governmentType));
    if (familyF.size) hit = hit.filter((r) => familyF.has(r.familyKey));
    if (regimeF.size) hit = hit.filter((r) => regimeF.has(r.regime));
    if (horizonF.size) hit = hit.filter((r) => horizonF.has(r.horizon));

    const out = [...hit];
    const dir = sortDir === "asc" ? 1 : -1;
    const byNext = (a: HubRow, b: HubRow) => {
      if (!a.nextDate && !b.nextDate) return a.name.localeCompare(b.name);
      if (!a.nextDate) return 1;
      if (!b.nextDate) return -1;
      return a.nextDate === b.nextDate ? a.name.localeCompare(b.name) : a.nextDate < b.nextDate ? -1 : 1;
    };
    if (sort === "name") out.sort((a, b) => dir * a.name.localeCompare(b.name));
    if (sort === "contests") out.sort((a, b) => dir * (a.contests - b.contests));
    if (sort === "next") out.sort((a, b) => dir * byNext(a, b));
    if (sort === "system")
      out.sort((a, b) => dir * a.governmentLabel.localeCompare(b.governmentLabel) || a.name.localeCompare(b.name));
    if (sort === "family")
      out.sort((a, b) => dir * a.familyLabel.localeCompare(b.familyLabel) || a.name.localeCompare(b.name));
    return out;
  }, [rows, q, sort, sortDir, systemF, familyF, regimeF, horizonF]);

  // A-Z headings only make sense while the list is alphabetical, unfiltered
  // and ascending.
  const grouped = sort === "name" && sortDir === "asc";
  let lastInitial = "";

  const anyFilterActive = systemF.size + familyF.size + regimeF.size + horizonF.size > 0;

  const cardItems = filtered.map((r) => {
    const initial = r.name[0].toUpperCase();
    const showHeading = grouped && !q && !anyFilterActive && initial !== lastInitial;
    if (showHeading) lastInitial = initial;
    return (
      <div key={r.code}>
        {showHeading ? (
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-dim)] mt-4 mb-1">
            {initial}
          </h3>
        ) : null}
        <Link
          href={r.href}
          className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-[var(--accent)]"
          style={{
            borderColor: r.overdue ? "#B4540A" : "var(--border)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.flagSrc}
            srcSet={r.flagSrcSet}
            alt=""
            width={28}
            height={21}
            className="rounded-[2px] shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[var(--text)]">
              {r.name}
              {r.note ? (
                <span
                  className="ml-2 align-middle rounded-full border px-2 py-0.5 text-[10px] font-normal"
                  style={
                    r.noteTone === "neutral"
                      ? { borderColor: "var(--border)", color: "var(--text-dim)" }
                      : { borderColor: "#B4540A", color: "#D97706" }
                  }
                >
                  {r.note}
                </span>
              ) : null}
            </span>
            <span className="block text-xs text-[var(--text-dim)] truncate">
              {r.region} · {r.governmentLabel} · last: {r.last}
            </span>
          </span>
          <span className="hidden sm:block shrink-0 text-right text-xs max-w-[16rem]">
            <span className="block text-[var(--text-muted)] truncate">{r.next}</span>
            <span className="block text-[10px] text-[var(--text-dim)] tabular-nums">
              {r.overdue
                ? "result due"
                : r.daysAway == null
                  ? "no date set"
                  : `${r.daysAway.toLocaleString("en-US")} days · ${r.contests} contests`}
            </span>
          </span>
        </Link>
      </div>
    );
  });

  const tableRows = filtered.map((r) => (
    <tr key={r.code} className="border-b" style={{ borderColor: "var(--border)" }}>
      <td className={TD}>
        <Link href={r.href} className="flex items-center gap-2 hover:text-[var(--accent)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.flagSrc} srcSet={r.flagSrcSet} alt="" width={20} height={15} className="rounded-[2px] shrink-0" />
          <span className="font-semibold text-[var(--text)]">{r.name}</span>
        </Link>
      </td>
      <td className={TD}>{r.governmentLabel}</td>
      <td className={TD}>{r.familyLabel}</td>
      <td className={TD}>{r.last}</td>
      <td className={TD}>{r.next}</td>
      <td className={THR}>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", ...MONO }}
        >
          {statusOf(r.confidence)}
        </span>
      </td>
    </tr>
  ));

  const mobileCardItems = filtered.map((r) => (
    <div key={`${r.code}-mc`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <Link href={r.href} className="flex items-center gap-2 font-semibold text-[var(--text)] hover:text-[var(--accent)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.flagSrc} srcSet={r.flagSrcSet} alt="" width={20} height={15} className="rounded-[2px] shrink-0" />
        {r.name}
      </Link>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{r.governmentLabel} · {r.familyLabel}</div>
      <div className="mt-1 text-xs text-[var(--text-dim)]">Last: {r.last}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--text-muted)] truncate">{r.next}</span>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", ...MONO }}
        >
          {statusOf(r.confidence)}
        </span>
      </div>
    </div>
  ));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex-1 min-w-[220px]">
          <span className="sr-only">Search election hubs</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${rows.length} hubs by country, region or election…`}
            className="w-full rounded-xl border px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
          />
        </label>
        <div className="inline-flex rounded-full border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="inline-flex min-h-11 items-center px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: view === v ? "var(--accent)" : "var(--bg-card)",
                color: view === v ? "#08080D" : "var(--text-muted)",
              }}
            >
              {v === "cards" ? "Cards" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter chip groups */}
      <div className="mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1" style={MONO}>System</span>
          {SYSTEM_OPTIONS.map((o) => (
            <Chip key={o.key} active={systemF.has(o.key)} onClick={() => setSystemF((s) => toggleInSet(s, o.key))}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1" style={MONO}>Electoral family</span>
          {familyOptions.map((o) => (
            <Chip key={o.key} active={familyF.has(o.key)} onClick={() => setFamilyF((s) => toggleInSet(s, o.key))}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1" style={MONO}>Regime</span>
          {REGIME_OPTIONS.map((o) => (
            <Chip key={o.key} active={regimeF.has(o.key)} onClick={() => setRegimeF((s) => toggleInSet(s, o.key))}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mr-1" style={MONO}>Horizon</span>
          {HORIZON_OPTIONS.map((o) => (
            <Chip key={o.key} active={horizonF.has(o.key)} onClick={() => setHorizonF((s) => toggleInSet(s, o.key))}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Sort control: buttons on wide screens double as the desktop table's
          sort, and drive the same sortKey/sortDir state as the mobile
          select + direction button below, so every control the table offers
          exists on the phone (DESIGN-STANDARDS section 6). */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="hidden sm:flex items-center gap-1 text-xs">
          {(["name", "next", "contests", "system", "family"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleSort(k)}
              aria-pressed={sort === k}
              className="rounded-full border px-3 py-1.5 transition-colors"
              style={{
                borderColor: sort === k ? "var(--accent)" : "var(--border)",
                color: sort === k ? "var(--accent)" : "var(--text-muted)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              {SORT_LABEL[k]}{sort === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <div className="flex sm:hidden items-center gap-2 text-xs w-full">
          <label className="flex-1 flex items-center gap-2 min-w-0">
            <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
            <select
              value={sort}
              onChange={(e) => toggleSort(e.target.value as SortKey)}
              className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {(["name", "next", "contests", "system", "family"] as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setSortDir(sortDir === "asc" ? "desc" : "asc");
              setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
            }}
            aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
            className="rounded-lg border px-3 py-2 text-sm flex-shrink-0 min-h-11"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            {sortDir === "asc" ? "▲" : "▼"}
          </button>
        </div>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      <p className="text-xs text-[var(--text-dim)] mb-3 tabular-nums" aria-live="polite">
        {filtered.length} of {rows.length} hubs
        {q ? ` matching "${q}"` : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-6">
          Nothing matches these filters. The atlas covers {rows.length} polities today; the coverage rule
          that decides which country joins next is on the{" "}
          <Link href="/elections" className="text-[var(--accent)] hover:underline">
            main elections page
          </Link>
          .
        </p>
      ) : view === "table" ? (
        <>
          <div className="hidden sm:block">
            <TableBox>
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                  <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("name")}>
                    Country{sort === "name" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("system")}>
                    System{sort === "system" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("family")}>
                    Family{sort === "family" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className={TH}>Last held</th>
                  <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("next")}>
                    Next{sort === "next" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className={THR}>Status</th>
                </tr>
              </thead>
              <tbody>{tableRows}</tbody>
            </TableBox>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              key={`table-${sort}-${sortDir}-${filtered.length}`}
              initial={12}
              noun="hubs"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={mobileCardItems}
            />
          </div>
        </>
      ) : (
        <>
          <div className="hidden sm:grid gap-2">{cardItems}</div>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              key={`cards-${sort}-${sortDir}-${q}-${systemF.size}-${familyF.size}-${regimeF.size}-${horizonF.size}-${filtered.length}`}
              initial={12}
              noun="hubs"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={cardItems}
            />
          </div>
        </>
      )}
    </div>
  );
}
