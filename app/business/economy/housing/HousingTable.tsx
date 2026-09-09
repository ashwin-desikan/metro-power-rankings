"use client";

// The "Where prices stand" board for /business/economy/housing. Sort idiom
// copied from RatesTable.tsx (sortable <th onClick> on desktop, a Sort-by
// <select> plus direction button for the phone cards). Two controls of its
// own: real or nominal terms (real is the default, per the scoping note), and
// the horizon column the board leads with.

import Link from "next/link";
import { useMemo, useState } from "react";
import { CappedList } from "@/app/_shared/Disclosure";
import { DivergingBar } from "@/app/_shared/DataBar";
import { MONO, TH, THR, TD, TDR, TableBox, SMCOL } from "../../ui";

// lib/economyHousing.ts is server-only (fs); the row type and the href are
// restated here for the client. Keep them in step.
export type BoardRow = {
  cbsa: string;
  name: string;
  states: string[];
  division: boolean;
  flavor: "purchase-only" | "all-transactions";
  metro: string | null;
  metroName: string | null;
  latest: string;
  index: number;
  nominal: Terms;
  real: Terms;
};
export type Terms = {
  y1: number | null; y5: number | null; y10: number | null; y25: number | null; since2000: number | null;
  drawdown: { peak: string; trough: string; pct: number } | null;
};
export type Horizon = "y1" | "y5" | "y10" | "y25" | "since2000";

const HORIZONS: { key: Horizon; label: string }[] = [
  { key: "y1", label: "1 year" },
  { key: "y5", label: "5 years" },
  { key: "y10", label: "10 years" },
  { key: "y25", label: "25 years" },
  { key: "since2000", label: "since 2000" },
];

type SortKey = "name" | "horizon" | "crash" | "index";
const SORT_LABEL: Record<SortKey, string> = { name: "Metro", horizon: "Change", crash: "2007 to 2012", index: "Index" };

function href(cbsa: string) {
  return `/business/economy/housing/${cbsa}`;
}

export default function HousingTable({ rows, baseYear, cpiLastYear }: { rows: BoardRow[]; baseYear: number; cpiLastYear: number }) {
  const [terms, setTerms] = useState<"real" | "nominal">("real");
  const [horizon, setHorizon] = useState<Horizon>("y10");
  const [sortKey, setSortKey] = useState<SortKey>("horizon");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [announce, setAnnounce] = useState("");

  const value = (r: BoardRow) => r[terms][horizon];
  const crash = (r: BoardRow) => r[terms].drawdown?.pct ?? null;

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const num = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * dir;
    };
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "index") return num(a.index, b.index);
      if (sortKey === "crash") return num(crash(a), crash(b));
      return num(value(a), value(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, terms, horizon]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const hLabel = HORIZONS.find((h) => h.key === horizon)!.label;

  const chip = (on: boolean) => ({
    background: on ? "var(--bg-card-hover)" : "var(--bg-card)",
    borderColor: on ? "var(--accent)" : "var(--border)",
    color: on ? "var(--accent)" : "var(--text-muted)",
  });

  function Name({ r }: { r: BoardRow }) {
    return (
      <span className="min-w-0">
        <Link href={href(r.cbsa)} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          {r.name}
        </Link>
        <span className="text-[var(--text-dim)] text-[11px] ml-1.5" style={MONO}>{r.states.join("-")}</span>
        {r.division ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]" title="FHFA publishes this metro as its principal metropolitan division">division</span> : null}
        {r.flavor === "all-transactions" ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]" title="All-transactions index (includes refinance appraisals); purchase-only is published for the 100 largest metros only">all-trans.</span> : null}
      </span>
    );
  }

  function Card({ r }: { r: BoardRow }) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <Name r={r} />
          <span className="font-bold tabular-nums" style={MONO}><DivergingBar v={value(r)} dp={1} label={`${hLabel} change`} /></span>
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5" style={MONO}>
          index {r.index.toFixed(1)} · crash {r[terms].drawdown ? `${r[terms].drawdown!.pct.toFixed(1)}%` : "none"}
          {r.metroName ? <> · <Link href={`/rankings/${r.metro}`} className="hover:underline" style={{ color: "var(--accent)" }}>{r.metroName}</Link></> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Terms and horizon">
        {(["real", "nominal"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTerms(t)} aria-pressed={terms === t}
            className="text-xs px-3 min-h-11 sm:min-h-9 rounded-md border inline-flex items-center" style={chip(terms === t)}>
            {t === "real" ? `Real (${baseYear} dollars)` : "Nominal"}
          </button>
        ))}
        <span className="w-px h-6 mx-1 hidden sm:block" style={{ background: "var(--border)" }} />
        {HORIZONS.map((h) => (
          <button key={h.key} type="button" onClick={() => setHorizon(h.key)} aria-pressed={horizon === h.key}
            className="text-xs px-3 min-h-11 sm:min-h-9 rounded-md border inline-flex items-center" style={chip(horizon === h.key)}>
            {h.label}
          </button>
        ))}
      </div>
      {terms === "real" ? (
        <p className="text-xs mb-3 text-[var(--text-muted)]">
          Real terms deflate each quarter by that year&apos;s US CPI, stated in {baseYear} dollars. The CPI runs to {cpiLastYear}; quarters after it are shown at {cpiLastYear} prices until the next annual print, so the one-year figure is nominal for now.
        </p>
      ) : null}

      <div className="flex items-center gap-2 mb-2 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select value={sortKey}
            onChange={(e) => { const k = e.target.value as SortKey; toggleSort(k); setAnnounce(`Sorted by ${SORT_LABEL[k]}`); }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-[16px] min-h-11"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setSortDir(sortDir === "asc" ? "desc" : "asc"); setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`); }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0 min-h-11" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      <div className="hidden sm:block">
        <TableBox stickyCol={1}>
          <thead>
            <tr className="text-left" style={{ background: "var(--bg-card)" }}>
              <th className={`${TH} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("name")}>Metro area{arrow("name")}</th>
              <th className={`${THR} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("horizon")}>{hLabel}{arrow("horizon")}</th>
              <th className={`${THR} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("crash")}>2007 to 2012{arrow("crash")}</th>
              <th className={`${THR} ${SMCOL} cursor-pointer hover:text-[var(--accent)]`} onClick={() => toggleSort("index")}>Index{arrow("index")}</th>
              <th className={`${TH} ${SMCOL}`}>Metro page</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.cbsa} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={`${TD} whitespace-nowrap`}><Name r={r} /></td>
                <td className={TDR} style={MONO}><DivergingBar v={value(r)} dp={1} label={`${hLabel} change`} /></td>
                <td className={TDR} style={MONO}>
                  {r[terms].drawdown ? (
                    <span title={`${r[terms].drawdown!.peak} to ${r[terms].drawdown!.trough}`}><DivergingBar v={r[terms].drawdown!.pct} dp={1} label="peak to trough" /></span>
                  ) : <span className="text-[var(--text-dim)]">no fall</span>}
                </td>
                <td className={`${TDR} ${SMCOL}`} style={MONO}>{r.index.toFixed(1)}</td>
                <td className={`${TD} ${SMCOL}`}>
                  {r.metroName ? <Link href={`/rankings/${r.metro}`} className="hover:underline" style={{ color: "var(--accent)" }}>{r.metroName}</Link> : <span className="text-[var(--text-dim)]">not on the site</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </div>
      <div className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
        <CappedList key={`housing-${sortKey}-${sortDir}-${terms}-${horizon}`} initial={12} noun="metro areas"
          bodyClassName="divide-y divide-[var(--border)]" items={sorted.map((r) => <Card key={r.cbsa} r={r} />)} />
      </div>
    </div>
  );
}
