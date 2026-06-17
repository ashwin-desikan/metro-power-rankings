"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// Sortable champions table for one scope block on /sports/champions. Plain
// serializable rows are passed from the server page (no server-only imports
// here). Click a column header to sort; click again to flip direction.

export type ChampRow = {
  team: string;
  teamHref: string | null;
  sport: string;
  competition: string;
  leagueHref: string | null;
  geo: string;
  year: number | null;
  gold: boolean;
};

type SortKey = "team" | "competition" | "geo" | "year";

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const CONTINENTS = new Set([
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
]);

// World first, then continents, then countries; alpha within each tier.
function geoRank(g: string): number {
  if (g === "World") return 0;
  if (CONTINENTS.has(g)) return 1;
  if (g === "—") return 3;
  return 2;
}

function sportDisplay(s: string): string {
  return s.replace(/^W /, "Women's ");
}

export default function ChampionsTable({ rows }: { rows: ChampRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const out = [...rows];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "year") {
        cmp = (a.year ?? 0) - (b.year ?? 0);
      } else if (sortKey === "geo") {
        cmp = geoRank(a.geo) - geoRank(b.geo) || a.geo.localeCompare(b.geo);
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return cmp * dir;
    });
    return out;
  }, [rows, sortKey, dir]);

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(1);
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (dir === 1 ? " ▲" : " ▼") : "";

  function Th({ label, k, right }: { label: string; k: SortKey; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        className={`py-2 px-3 font-medium select-none cursor-pointer hover:text-[var(--accent)] ${right ? "text-right" : "text-left"}`}
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
        onClick={() => toggle(k)}
        aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
        scope="col"
      >
        {label}
        <span aria-hidden style={mono}>{arrow(k)}</span>
      </th>
    );
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs">
            <Th label="Champion" k="team" />
            <Th label="Competition" k="competition" />
            <Th label="Region" k="geo" />
            <Th label="Since" k="year" right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr key={`${c.team}-${c.competition}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-2 px-3 align-top">
                <div className="font-medium text-sm leading-tight">
                  {c.teamHref ? (
                    <Link href={c.teamHref} className="hover:text-[var(--accent)] hover:underline">
                      {c.team}
                    </Link>
                  ) : (
                    <span>{c.team}</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text-dim)]">{sportDisplay(c.sport)}</div>
              </td>
              <td className="py-2 px-3 align-top">
                {c.leagueHref ? (
                  <Link href={c.leagueHref} className="hover:text-[var(--accent)] hover:underline">
                    {c.competition}
                  </Link>
                ) : (
                  <span>{c.competition}</span>
                )}
                {c.gold && (
                  <span
                    aria-label="Gold Standard competition"
                    title="Gold Standard — the apex trophy in its sport"
                    className="ml-1 cursor-default"
                  >
                    🥇
                  </span>
                )}
              </td>
              <td className="py-2 px-3 align-top text-[var(--text-muted)]">{c.geo}</td>
              <td className="py-2 px-3 align-top text-right tabular-nums" style={{ ...mono, color: GOLD }}>
                {c.year ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
