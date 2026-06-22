"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Filterable, sortable rivalries board for /sports/rivalries. One row per unique
// rivalry; one-way rivalries list the antagonist as Team. Click any header to sort.

export type RivalryRow = {
  sport: string;
  rivalry: string;
  teamName: string;
  teamHref: string | null;
  rivalName: string;
  rivalHref: string | null;
  country: string;
  twoWay: boolean;
  top: boolean;
};

const ALL = "All";

type SortKey = "rivalry" | "sport" | "team" | "rival" | "country" | "direction" | "top";

function val(r: RivalryRow, k: SortKey): string | number {
  switch (k) {
    case "rivalry": return r.rivalry.toLowerCase();
    case "sport": return r.sport.toLowerCase();
    case "team": return r.teamName.toLowerCase();
    case "rival": return r.rivalName.toLowerCase();
    case "country": return r.country.toLowerCase();
    case "direction": return r.twoWay ? 1 : 0;
    case "top": return r.top ? 1 : 0;
  }
}

function Side({ name, href }: { name: string; href: string | null }) {
  return href ? (
    <Link href={href} className="hover:text-[var(--accent)] transition-colors">{name}</Link>
  ) : (
    <span>{name}</span>
  );
}

export default function RivalriesTable({ rows }: { rows: RivalryRow[] }) {
  const [sport, setSport] = useState(ALL);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sports = useMemo(() => [ALL, ...Array.from(new Set(rows.map((r) => r.sport))).sort()], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (sport !== ALL && r.sport !== sport) return false;
      if (needle) {
        const hay = `${r.rivalry} ${r.teamName} ${r.rivalName} ${r.country}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, sport, q]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const f = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    f.sort((a, b) => {
      const av = val(a, sortKey), bv = val(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.rivalry.localeCompare(b.rivalry);
    });
    return f;
  }, [filtered, sortKey, sortDir]);

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "top" || k === "direction" ? "desc" : "asc"); }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const selectStyle = { borderColor: "var(--border)", color: "var(--text)" } as const;
  const Th = ({ k, label, cls = "" }: { k: SortKey; label: string; cls?: string }) => (
    <th className={`py-2 px-3 font-medium ${cls}`}>
      <button type="button" onClick={() => clickSort(k)} className="inline-flex items-center hover:text-[var(--text)]">
        {label}<span aria-hidden style={{ color: "#d4af37" }}>{arrow(k)}</span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team, rivalry or country"
          className="rounded-md border px-3 py-1 text-sm flex-1 min-w-[200px] bg-[var(--bg-card)]"
          style={selectStyle}
        />
        <label className="text-xs text-[var(--text-muted)]">
          Sport{" "}
          <select className="rounded-md border px-2 py-1 text-sm bg-[var(--bg-card)]" style={selectStyle} value={sport} onChange={(e) => setSport(e.target.value)}>
            {sports.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="text-xs text-[var(--text-muted)] tabular-nums ml-auto">{sorted.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <Th k="rivalry" label="Rivalry" />
              <Th k="sport" label="Sport" />
              <Th k="team" label="Team" />
              <Th k="rival" label="Rival Team" />
              <Th k="country" label="Country" />
              <Th k="direction" label="Direction" />
              <Th k="top" label="Note" cls="hidden sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={`${r.sport}-${r.rivalry}-${r.teamName}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-3 font-medium">{r.rivalry || "—"}</td>
                <td className="py-2 px-3 text-[var(--text-muted)] whitespace-nowrap">{r.sport}</td>
                <td className="py-2 px-3"><Side name={r.teamName} href={r.teamHref} /></td>
                <td className="py-2 px-3"><Side name={r.rivalName} href={r.rivalHref} /></td>
                <td className="py-2 px-3 text-[var(--text-muted)] whitespace-nowrap">{r.country || "—"}</td>
                <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                  {r.twoWay
                    ? <span className="text-[var(--text-muted)]">Two-way</span>
                    : <span style={{ color: "#b58900" }}>One-way</span>}
                </td>
                <td className="py-2 px-3 hidden sm:table-cell">
                  {r.top && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#d4af37" }}>★ Top Rivalry</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
