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
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
            <Th k="state" label="State" />
            <Th k="name" label="Senator" />
            <Th k="party" label="Party" />
            <Th k="cls" label="Class" right hideOnMobile />
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
              <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell">{r.cls}</td>
              <td className="py-2 px-4 text-right tabular-nums text-[var(--text)]">{r.score > 0 ? r.score.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
