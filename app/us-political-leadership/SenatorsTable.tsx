"use client";
import { useState } from "react";
import Link from "next/link";

export type SenRow = {
  name: string;
  state: string;
  stateSlug: string;
  party: string;
  cls: number;
  score: number;
};
type SortKey = "state" | "name" | "party" | "cls" | "score";

function partyClass(p: string): string {
  const s = p.toLowerCase();
  if (s.includes("republican")) return "text-red-700 dark:text-red-400";
  if (s.includes("democratic")) return "text-blue-700 dark:text-blue-400";
  return "text-[var(--text-muted)]";
}

export default function SenatorsTable({ rows }: { rows: SenRow[] }) {
  const [key, setKey] = useState<SortKey>("state");
  const [dir, setDir] = useState<1 | -1>(1);
  function sortBy(k: SortKey) {
    if (k === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setKey(k);
      setDir(k === "score" ? -1 : 1);
    }
  }
  const sorted = [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (key === "score") {
      av = a.score;
      bv = b.score;
    } else if (key === "cls") {
      av = a.cls;
      bv = b.cls;
    } else {
      av = (a[key] || "").toString().toLowerCase();
      bv = (b[key] || "").toString().toLowerCase();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  function Th({ k, label, right, hideOnMobile }: { k: SortKey; label: string; right?: boolean; hideOnMobile?: boolean }) {
    return (
      <th
        onClick={() => sortBy(k)}
        className={`py-2 px-4 cursor-pointer select-none hover:text-[var(--accent)] ${right ? "text-right" : ""} ${hideOnMobile ? "hidden sm:table-cell" : ""}`}
      >
        {label}
        {key === k ? (dir === 1 ? " ▲" : " ▼") : ""}
      </th>
    );
  }
  return (
    <div>
      {/* Mobile sort control: the desktop header cells (onClick={() => sortBy(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same key/dir state. */}
      <div className="flex items-center gap-2 mb-3 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={key}
            onChange={(e) => sortBy(e.target.value as SortKey)}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="state">State</option>
            <option value="name">Senator</option>
            <option value="party">Party</option>
            <option value="cls">Class</option>
            <option value="score">Metro score</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => sortBy(key)}
          aria-label={dir === 1 ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {dir === 1 ? "▲" : "▼"}
        </button>
      </div>

      {/* Mobile: stacked cards instead of hiding the Class column */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r, i) => (
          <div key={`${r.stateSlug}-${r.name}-${i}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm text-[var(--text)]">{r.name}</div>
                <Link href={`/states/${r.stateSlug}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                  {r.state}
                </Link>
              </div>
              <span className={`text-xs font-medium flex-shrink-0 ${partyClass(r.party)}`}>{r.party}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Class</div>
                <div className="tabular-nums text-[var(--text-muted)]">{r.cls}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Metro score</div>
                <div className="tabular-nums text-[var(--text)] font-semibold">{r.score > 0 ? r.score.toFixed(1) : "—"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              <Th k="state" label="State" />
              <Th k="name" label="Senator" />
              <Th k="party" label="Party" />
              <Th k="cls" label="Class" right />
              <Th k="score" label="Metro score" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={`${r.stateSlug}-${r.name}-${i}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-4">
                  <Link href={`/states/${r.stateSlug}`} className="text-[var(--text)] hover:text-[var(--accent)]">
                    {r.state}
                  </Link>
                </td>
                <td className="py-2 px-4 font-medium text-[var(--text)]">{r.name}</td>
                <td className={`py-2 px-4 font-medium ${partyClass(r.party)}`}>{r.party}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{r.cls}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text)]">{r.score > 0 ? r.score.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
