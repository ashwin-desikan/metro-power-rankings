"use client";

import { useMemo, useState } from "react";

// Interactive constituency table for a single UK general election (1918+).
// Row shape mirrors public/data/uk-const/{id}.json:
// [name, region, electorate, totalVotes, turnoutPct, conS, libS, labS, natS, othS, winnerIdx, unopposed]
export type ConstRow = [
  string, string, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null, number | null,
  number | null, number,
];

const SHARE_COLS = [5, 6, 7, 8, 9] as const;

export default function ConstituencyExplorer({
  rows,
  families,
  labels,
  colors,
}: {
  rows: ConstRow[];
  families: string[];
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [sortKey, setSortKey] = useState<number>(0); // column index
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const regions = useMemo(() => Array.from(new Set(rows.map((r) => r[1]))).sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) => (region === "all" || r[1] === region) && (!needle || r[0].toLowerCase().includes(needle)),
    );
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return sortDir * av.localeCompare(bv);
      const an = av == null ? -Infinity : (av as number);
      const bn = bv == null ? -Infinity : (bv as number);
      return sortDir * (an - bn);
    });
    return out;
  }, [rows, q, region, sortKey, sortDir]);

  const clickSort = (k: number, defaultDir: 1 | -1) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(defaultDir);
    }
  };
  const arrow = (k: number) => (sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : "");

  const th = "px-2 py-1.5 cursor-pointer select-none hover:text-[var(--accent)] whitespace-nowrap";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search constituencies…"
          aria-label="Search constituencies"
          className="rounded-lg border px-3 py-1.5 bg-transparent text-[var(--text)] w-56"
          style={{ borderColor: "var(--border)" }}
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Filter by country or region"
          className="rounded-lg border px-2 py-1.5 bg-transparent text-[var(--text)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <option value="all">All countries &amp; regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">
          {filtered.length} of {rows.length} constituencies
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[32rem] rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              <th className={th} onClick={() => clickSort(0, 1)}>Constituency{arrow(0)}</th>
              <th className={th} onClick={() => clickSort(1, 1)}>Region{arrow(1)}</th>
              <th className={`${th} text-left`}>Most votes</th>
              {SHARE_COLS.map((c, i) => (
                <th key={families[i]} className={`${th} text-right`} onClick={() => clickSort(c, -1)}>
                  {labels[families[i]] ?? families[i]}{arrow(c)}
                </th>
              ))}
              <th className={`${th} text-right`} onClick={() => clickSort(4, -1)}>Turnout{arrow(4)}</th>
              <th className={`${th} text-right`} onClick={() => clickSort(3, -1)}>Votes{arrow(3)}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const fam = r[10] != null ? families[r[10]] : null;
              return (
                <tr key={`${r[0]}-${r[1]}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1 font-semibold text-[var(--text)] whitespace-nowrap">{r[0]}</td>
                  <td className="px-2 py-1 text-[var(--text-muted)] whitespace-nowrap">{r[1]}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {fam ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: colors[fam] }} />
                        <span className="text-[var(--text)]">{labels[fam] ?? fam}</span>
                        {r[11] ? <span className="text-[var(--text-dim)]"> · unopposed</span> : null}
                      </>
                    ) : "—"}
                  </td>
                  {SHARE_COLS.map((c) => (
                    <td key={c} className={`px-2 py-1 text-right tabular-nums ${r[10] != null && c === 5 + r[10] ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                      {r[c] != null ? `${(r[c] as number).toFixed(1)}%` : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right tabular-nums text-[var(--text-muted)]">{r[4] != null ? `${r[4].toFixed(1)}%` : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-[var(--text-muted)]">{r[3] != null ? r[3].toLocaleString("en-GB") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
