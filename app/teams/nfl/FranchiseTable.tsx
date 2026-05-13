"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise } from "@/lib/nfl";

// Sortable franchise table for /teams/nfl. The page server-renders a logo
// URL map (via logoUrlFor in lib/nfl.ts) so the client never has to do
// filesystem checks. Initial sort matches the prior cards order:
// championships desc, then all-time win pct desc.

type SortKey =
  | "name"
  | "metro"
  | "division"
  | "founding_year"
  | "championships"
  | "division_titles"
  | "win_pct"
  | "record"
  | "playoff_appearances";

type SortDir = "asc" | "desc";

type Mono = { bg: string; fg: string; mono: string };

type Props = {
  franchises: Franchise[];
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono>;
};

const TITLE_GOLD = "#d4af37";

function compare(a: Franchise, b: Franchise, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "metro": return (a.metro || "").localeCompare(b.metro || "");
    case "division": return (a.division || "").localeCompare(b.division || "");
    case "founding_year": return (a.founding_year ?? 0) - (b.founding_year ?? 0);
    case "championships": return a.championships - b.championships;
    case "division_titles": return a.division_titles - b.division_titles;
    case "win_pct": return a.win_pct - b.win_pct;
    case "record": return a.all_time_w - b.all_time_w;
    case "playoff_appearances": return a.playoff_appearances - b.playoff_appearances;
  }
}

export default function FranchiseTable({ franchises, logoMap, monoMap }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...franchises];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      const tiebreak = sortKey === "championships" ? (a.win_pct - b.win_pct) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return arr;
  }, [franchises, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Numeric columns default to desc on first click (most champs first),
      // text columns default to asc.
      const numeric: SortKey[] = ["championships", "division_titles", "win_pct", "record", "playoff_appearances", "founding_year"];
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  }

  return (
    <section
      className="rounded-xl border overflow-x-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-xs sm:text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
            <Th label="Franchise"            k="name"                cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
            <Th label="Metro"                k="metro"               cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="Division"             k="division"            cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="Founded"              k="founding_year"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Titles"               k="championships"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Div"                  k="division_titles"     cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Playoffs"             k="playoff_appearances" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="All-time"             k="record"              cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Win%"                 k="win_pct"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const logo = logoMap[f.slug];
            const mono = monoMap[f.slug];
            return (
              <tr key={f.slug} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                <td className="py-2.5 pl-4 pr-3">
                  <Link href={`/teams/nfl/${f.slug}`} className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                    {logo ? (
                      <img src={logo} alt="" className="w-8 h-8 flex-shrink-0 object-contain" />
                    ) : (
                      <span
                        className="inline-grid place-items-center rounded-full flex-shrink-0"
                        style={{
                          background: mono?.bg, color: mono?.fg,
                          width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",
                        }}
                        aria-hidden
                      >
                        {mono?.mono}
                      </span>
                    )}
                    <span className="font-semibold">{f.name}</span>
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-[var(--text-muted)]">
                  {f.metro_slug ? (
                    <Link href={`/metros/${f.metro_slug}`} className="hover:text-[var(--accent)] transition-colors">
                      {f.metro}
                    </Link>
                  ) : (
                    f.metro
                  )}
                </td>
                <td className="py-2.5 pr-3 text-[var(--text-muted)]">{f.division}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.founding_year ?? "—"}</td>
                <td className="py-2.5 pr-3 text-right">
                  <span
                    className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: f.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
                      color: f.championships > 0 ? TITLE_GOLD : "var(--text-dim)",
                    }}
                  >
                    {f.championships}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.division_titles}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.playoff_appearances}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.all_time_w}-{f.all_time_l}-{f.all_time_t}</td>
                <td className="py-2.5 pr-4 text-right">{f.win_pct.toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Sortable column header. Renders the label, a direction indicator when
// active, and a hover state to advertise interactivity.
function Th({
  label, k, cur, dir, onClick, align, className,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const isActive = cur === k;
  return (
    <th
      className={`font-medium py-2 pr-3 uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      onClick={() => onClick(k)}
      style={{ color: isActive ? "var(--text)" : undefined }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span aria-hidden style={{ color: "var(--accent)" }}>
            {dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );
}
