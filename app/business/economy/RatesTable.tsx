"use client";

// Sortable "Where rates stand" board for /business/economy. Sort idiom
// copied from app/leaders/LeadersDirectory.tsx: sortable <th onClick> on
// desktop, a Sort-by <select> + direction button driving the same state on
// the phone card list (the desktop header controls disappear behind
// `hidden sm:block`, so the phone needs its own way to reach every sort).

import Link from "next/link";
import { useMemo, useState } from "react";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { CappedList } from "@/app/_shared/Disclosure";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";
import { MONO, TH, THR, TD, TDR, TableBox, SMCOL } from "../ui";

// Client component: lib/economyRates.ts is server-only (fs), so the href
// helper is repeated here rather than imported. Keep the two in step.
function bankHref(code: string): string {
  return `/business/economy/rates/${code}`;
}

export type RateRow = {
  code: string;
  name: string;
  short: string;
  iso2: string;
  founded: string | null;
  series_from: string;
  last_change: string;
  level: number;
  changes_12m: number;
  hold_days: number | null;
  direction_12m: "cutting" | "hiking" | "hold" | "mixed" | "market" | "ended";
  power_rank: number | null;
  ended: string | null;
  ended_note: string | null;
  moveDate: string | null;
  moveChange: number | null;
};

type SortKey = "bank" | "level" | "move" | "trailing" | "hold";

// Fed, ECB, BoE lead the default order regardless of power_rank - the three
// rates a reader reaches for first. They stay pinned only in that default
// ("Bank") order; every other sort is a plain comparator on its column.
const PINNED = ["fed", "ecb", "boe"];

const DIRECTION_LABEL: Record<RateRow["direction_12m"], string> = {
  cutting: "cutting",
  hiking: "hiking",
  hold: "on hold",
  mixed: "mixed",
  market: "market rate",
  ended: "ended",
};

function fullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtPct(n: number): string {
  const dp = Math.abs(Math.round(n * 1000) - Math.round(n * 100) * 10) > 0.5 ? 3 : 2;
  return `${n.toFixed(dp)}%`;
}

// Every recorded `ended` date in the data is the last day of a year (Dec 31,
// the eve of the following 1 January euro changeover), so the euro year is
// simply one past it - see ended_note for the source sentence per bank.
function euroYear(ended: string): number {
  return Number(ended.slice(0, 4)) + 1;
}

function compareBank(a: RateRow, b: RateRow): number {
  const pa = PINNED.indexOf(a.code), pb = PINNED.indexOf(b.code);
  if (pa !== -1 || pb !== -1) {
    if (pa !== -1 && pb !== -1) return pa - pb;
    return pa !== -1 ? -1 : 1;
  }
  const ea = a.ended ? 1 : 0, eb = b.ended ? 1 : 0;
  if (ea !== eb) return ea - eb;
  const ra = a.power_rank ?? Infinity, rb = b.power_rank ?? Infinity;
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}

function cmpNullableNum(av: number | null, bv: number | null, dir: number): number {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir * (av - bv);
}

function cmpNullableStr(av: string | null, bv: string | null, dir: number): number {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir * (av < bv ? -1 : av > bv ? 1 : 0);
}

function compareRows(a: RateRow, b: RateRow, sortKey: SortKey, sortDir: "asc" | "desc"): number {
  const dir = sortDir === "asc" ? 1 : -1;
  let c = 0;
  if (sortKey === "bank") c = compareBank(a, b) * dir;
  else if (sortKey === "level") c = dir * (a.level - b.level);
  else if (sortKey === "move") c = cmpNullableStr(a.moveDate, b.moveDate, dir);
  else if (sortKey === "trailing") c = dir * (a.changes_12m - b.changes_12m);
  else c = cmpNullableNum(a.hold_days, b.hold_days, dir);
  return c !== 0 ? c : a.name.localeCompare(b.name);
}

const SORT_LABEL: Record<SortKey, string> = {
  bank: "Bank",
  level: "Level",
  move: "Last move",
  trailing: "Trailing year",
  hold: "Hold",
};
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  bank: "asc",
  level: "desc",
  move: "desc",
  trailing: "desc",
  hold: "desc",
};

function BankName({ b }: { b: RateRow }) {
  return (
    <Link href={bankHref(b.code)} className="hover:underline font-semibold inline-flex items-center gap-1.5 flex-wrap" style={{ color: "var(--accent)" }}>
      <img src={flagUrlByCode(b.iso2.toLowerCase())} srcSet={flagSrcSetByCode(b.iso2.toLowerCase())} alt="" width={16} height={12} className="rounded-[2px] flex-shrink-0" loading="lazy" decoding="async" />
      <span className="truncate">{b.name}</span>
      {b.ended && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-normal" style={{ ...MONO, background: "var(--bg-card)", color: "var(--text-dim)" }}>
          Euro since {euroYear(b.ended)}
        </span>
      )}
    </Link>
  );
}

function SinceCell({ b }: { b: RateRow }) {
  return b.founded ? (
    <span title={fullDate(b.founded)}>Founded {b.founded.slice(0, 4)}</span>
  ) : (
    <span className="text-[var(--text-dim)]">series from {b.series_from.slice(0, 4)}</span>
  );
}

function MoveCell({ b }: { b: RateRow }) {
  if (!b.moveDate) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <>
      {b.moveDate}
      {b.moveChange != null && (
        <span className="ml-2">
          <DivergingBar v={b.moveChange} dp={2} suffix="%" style={{ color: b.moveChange >= 0 ? "var(--div-pos)" : "var(--div-neg)" }} />
        </span>
      )}
    </>
  );
}

export default function RatesTable({ rows }: { rows: RateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("bank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [announce, setAnnounce] = useState("");

  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)), [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(DEFAULT_DIR[key]); }
  }
  function arrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  function RowCard({ b }: { b: RateRow }) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <BankName b={b} />
          <span className="font-bold tabular-nums" style={MONO}><DataBar v={b.level} format={fmtPct} label="policy rate" /></span>
        </div>
        {b.ended ? (
          <div className="text-xs text-[var(--text-muted)]">{b.ended_note}</div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-0.5" style={MONO}>
            <span>{DIRECTION_LABEL[b.direction_12m]}</span>
            <span className="inline-flex items-center gap-1.5"><MoveCell b={b} /></span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Mobile sort control: the desktop header cells (onClick={() => toggleSort(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/sortDir state. */}
      <div className="flex items-center gap-2 mb-2 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              toggleSort(key);
              setAnnounce(`Sorted by ${SORT_LABEL[key]}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm min-h-11"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
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
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      <div className="hidden sm:block">
        <TableBox>
          <thead>
            <tr className="text-left" style={{ background: "var(--bg-card)" }}>
              <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("bank")}>Bank{arrow("bank")}</th>
              <th className={`${THR} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("level")}>Level{arrow("level")}</th>
              <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("move")}>Last move{arrow("move")}</th>
              <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("trailing")}>Trailing year{arrow("trailing")}</th>
              <th className={`${THR} ${SMCOL} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("hold")}>Hold{arrow("hold")}</th>
              <th className={`${TH} ${SMCOL}`}>Since</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={`${TD} whitespace-nowrap`}><BankName b={b} /></td>
                <td className={TDR} style={MONO}><DataBar v={b.level} format={fmtPct} label="policy rate" /></td>
                {b.ended ? (
                  <>
                    <td className={`${TD} whitespace-nowrap`} style={MONO}><MoveCell b={b} /></td>
                    <td className={`${TD} text-[var(--text-muted)]`} colSpan={2}>{b.ended_note}</td>
                  </>
                ) : (
                  <>
                    <td className={`${TD} whitespace-nowrap`} style={MONO}><MoveCell b={b} /></td>
                    <td className={TD}>{DIRECTION_LABEL[b.direction_12m]}</td>
                    <td className={`${TDR} ${SMCOL}`} style={MONO}>{b.hold_days != null ? `${b.hold_days}d` : "—"}</td>
                  </>
                )}
                <td className={`${TD} ${SMCOL} text-[var(--text-muted)]`}><SinceCell b={b} /></td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </div>
      <div className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
        <CappedList
          key={`rates-${sortKey}-${sortDir}`}
          initial={12}
          noun="central banks"
          bodyClassName="divide-y divide-[var(--border)]"
          items={sorted.map((b) => <RowCard key={b.code} b={b} />)}
        />
      </div>
    </div>
  );
}
