"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TableScroll } from "@/app/_shared/TableScroll";

// HeartbreakBoard — the main ranked board with sport and country filters.
// Ranks shown are GLOBAL (position on the unfiltered board), so filtering to
// Scotland or the NHL shows where those clubs sit on the world scale.

export interface BoardRow {
  rank: number;
  name: string;
  href?: string;
  sport: string;
  country?: string;
  total: number;
  agony: number;
  despair: number;
  quadrant?: string;
  waiting: string;
  wound: string;
}

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const BORD = { borderColor: "var(--border)" } as const;

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent)]"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--text)",
        background: "var(--bg-card)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 px-2 border-b" style={BORD}>{children}</th>;
}

export default function HeartbreakBoard({ rows }: { rows: BoardRow[] }) {
  const [sport, setSport] = useState("All");
  const [country, setCountry] = useState("All");

  const sports = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((r) => r.sport)))],
    [rows],
  );
  const countries = useMemo(
    () => ["All", ...Array.from(new Set(rows.filter((r) => r.sport === "Football" && r.country)
      .map((r) => r.country as string))).sort()],
    [rows],
  );

  const filtered = rows.filter(
    (r) =>
      (sport === "All" || r.sport === sport) &&
      (sport !== "Football" || country === "All" || r.country === country),
  );
  const shown = filtered.slice(0, 100);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {sports.map((s) => (
          <Chip key={s} label={s} active={sport === s}
            onClick={() => { setSport(s); setCountry("All"); }} />
        ))}
      </div>
      {sport === "Football" && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {countries.map((c) => (
            <Chip key={c} label={c} active={country === c} onClick={() => setCountry(c)} />
          ))}
        </div>
      )}
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={MONO}>
        {filtered.length} clubs match{filtered.length > 100 ? " · showing the top 100" : ""} · ranks are global
      </div>
      <TableScroll className="rounded-xl border" style={CARD}>
        <table className="w-full text-[13px]" data-sticky-col="2">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--text-dim)]">
              <Th>#</Th>
              <Th>Club</Th>
              <Th>Sport</Th>
              <Th>Heartbreak</Th>
              <Th>Agony</Th>
              <Th>Despair</Th>
              <Th>Quadrant</Th>
              <Th>Waiting since</Th>
              <Th>Worst wound</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.sport}-${r.rank}`}>
                <td className="py-1.5 px-2 border-b text-[var(--text-dim)]" style={{ ...BORD, ...MONO }}>{r.rank}</td>
                <td className="py-1.5 px-2 border-b font-medium" style={BORD}>
                  {r.href ? <Link href={r.href} className="hover:underline">{r.name}</Link> : r.name}
                </td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)] whitespace-nowrap" style={BORD}>
                  {r.sport === "Football" ? `Football · ${r.country ?? ""}` : r.sport}
                </td>
                <td className="py-1.5 px-2 border-b font-bold" style={{ ...BORD, ...MONO }}>{r.total.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{r.agony.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={{ ...BORD, ...MONO }}>{r.despair.toFixed(1)}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.quadrant ?? "–"}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.waiting}</td>
                <td className="py-1.5 px-2 border-b text-[var(--text-muted)]" style={BORD}>{r.wound}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
