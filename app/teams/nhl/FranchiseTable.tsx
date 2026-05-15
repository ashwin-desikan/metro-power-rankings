"use client";

// Sortable franchise table for /teams/nhl. Simpler than the NBA equivalent
// because v1 ships without a live playoff-state column; the live status
// chip lives on the team page hero and the standings widget above. The
// Cups column folds Stanley Cup and Avco Cup totals but visualizes them
// distinctly via era-coded chips on the team page itself.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise } from "@/lib/nhl";

type Mono = { bg: string; fg: string; mono: string };

type SortKey =
  | "name"
  | "main_div"
  | "founded"
  | "championships"
  | "champ_apps"
  | "presidents"
  | "playoff_apps"
  | "pts_pct"
  | "last_cup";

type SortDir = "asc" | "desc";

type Props = {
  franchises: Franchise[];
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono | null>;
  originalSix: Set<string>;
};

function compare(a: Franchise, b: Franchise, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "main_div": return (a.current_main_div || "").localeCompare(b.current_main_div || "");
    case "founded": return (a.founded ?? 0) - (b.founded ?? 0);
    case "championships": return a.championships - b.championships;
    case "champ_apps": return a.champ_appearances - b.champ_appearances;
    case "presidents": return a.best_record_seasons - b.best_record_seasons;
    case "playoff_apps": return a.playoff_appearances - b.playoff_appearances;
    case "pts_pct": return a.pts_pct - b.pts_pct;
    case "last_cup": return (a.last_championship ?? 0) - (b.last_championship ?? 0);
  }
}

export default function FranchiseTable({ franchises, logoMap, monoMap, originalSix }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...franchises];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      const tiebreak = sortKey === "championships" ? (a.pts_pct - b.pts_pct) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return arr;
  }, [franchises, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      const numeric: SortKey[] = [
        "championships", "champ_apps", "presidents", "playoff_apps",
        "pts_pct", "founded", "last_cup",
      ];
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
            <Th label="Franchise"   k="name"            cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
            <Th label="Division"    k="main_div"        cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="Founded"     k="founded"         cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Cups"        k="championships"   cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Finals"      k="champ_apps"      cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Pres."       k="presidents"      cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Playoff app" k="playoff_apps"    cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Pts %"       k="pts_pct"         cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Last Cup"    k="last_cup"        cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const logo = logoMap[f.slug];
            const mono = monoMap[f.slug];
            const isO6 = originalSix.has(f.name);
            return (
              <tr key={f.slug} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className="pl-4 py-2">
                  <Link href={`/teams/nhl/${f.slug}`} className="flex items-center gap-2 hover:text-[var(--accent)] transition-colors">
                    {logo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={logo} alt="" className="w-5 h-5 flex-shrink-0 object-contain" />
                    ) : mono ? (
                      <span
                        className="inline-grid place-items-center rounded-full flex-shrink-0"
                        style={{ background: mono.bg, color: mono.fg, width: 20, height: 20, fontSize: 8, fontWeight: 700 }}
                        aria-hidden
                      >
                        {mono.mono}
                      </span>
                    ) : null}
                    <span className="font-medium">{f.display_name}</span>
                    {isO6 && (
                      <span
                        title="Original Six (1942-1967)"
                        className="text-[8px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "#3a2e1a", color: "#d4af37" }}
                      >
                        O6
                      </span>
                    )}
                  </Link>
                </td>
                <td className="py-2 text-[var(--text-muted)]">{f.current_main_div || ""}</td>
                <td className="py-2 text-right">{f.founded ?? ""}</td>
                <td className="py-2 text-right">
                  {f.championships > 0 ? (
                    <span
                      className="inline-flex items-center justify-center font-semibold px-1.5 rounded"
                      style={{ background: "#3a2e1a", color: "#d4af37" }}
                    >
                      {f.championships}
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">0</span>
                  )}
                </td>
                <td className="py-2 text-right">{f.champ_appearances}</td>
                <td className="py-2 text-right">{f.best_record_seasons || ""}</td>
                <td className="py-2 text-right">{f.playoff_appearances}</td>
                <td className="py-2 text-right text-[var(--text-muted)]">{f.pts_pct ? f.pts_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                <td className="py-2 pr-4 text-right text-[var(--text-muted)]">{f.last_championship ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Th({
  label, k, cur, dir, onClick, align = "left", className = "",
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = k === cur;
  const arrow = active ? (dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      className={`py-2 px-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap select-none cursor-pointer ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
      onClick={() => onClick(k)}
    >
      <span className={active ? "text-[var(--text)]" : ""}>{label}</span>
      <span className="text-[var(--text-dim)]">{arrow}</span>
    </th>
  );
}
