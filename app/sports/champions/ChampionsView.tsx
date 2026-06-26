"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSessionState } from "@/lib/useSessionState";
import ChampionsTable, { type ChampRow } from "./ChampionsTable";

// Client wrapper for /sports/champions: a Current | All-Time toggle. Current is
// the existing reigning-holders board; All-Time is a competition index (one
// line per competition, span + count + current holder) linking to each
// honour-roll page. Toggle persists for the browser session.

export type CompIndexEntry = {
  competition: string;
  compSlug: string;
  sport: string;
  scopeType: string;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  current: { champion: string; canonical: string; teamHref: string | null; year: number | null } | null;
};

const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const SPORT_ORDER = [
  "Football", "W Football", "American Football", "Canadian Football", "Basketball",
  "W Basketball", "Baseball", "Hockey", "Cricket", "Rugby Union", "Rugby League",
  "Aussie Rules", "Handball", "Volleyball", "Golf", "Tennis", "F1", "Olympics",
];
function sportRank(s: string): number {
  const i = SPORT_ORDER.indexOf(s);
  return i === -1 ? SPORT_ORDER.length : i;
}

function span(e: CompIndexEntry): string {
  if (e.firstYear == null || e.lastYear == null) return "";
  return e.firstYear === e.lastYear ? `${e.firstYear}` : `${e.firstYear}–${e.lastYear}`;
}

function AllTimeIndex({ index }: { index: CompIndexEntry[] }) {
  const groups = useMemo(() => {
    const by = new Map<string, CompIndexEntry[]>();
    for (const e of index) {
      const a = by.get(e.sport);
      if (a) a.push(e);
      else by.set(e.sport, [e]);
    }
    return [...by.entries()].sort((a, b) => sportRank(a[0]) - sportRank(b[0]) || a[0].localeCompare(b[0]));
  }, [index]);

  return (
    <div className="space-y-8">
      {groups.map(([sport, entries]) => (
        <section key={sport}>
          <h2 className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: GOLD }}>
            {sport}
          </h2>
          <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
            {entries
              .sort((a, b) => a.competition.localeCompare(b.competition))
              .map((e) => (
                <div key={e.compSlug} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--bg-card)] transition">
                  <Link
                    href={`/sports/champions/${e.compSlug}`}
                    className="font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline"
                  >
                    {e.competition}
                  </Link>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]" style={mono}>
                    {span(e)}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--text-dim)]" style={mono}>
                    {e.count} {e.count === 1 ? "champion" : "champions"}
                  </span>
                  {e.current && (
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      Current:{" "}
                      {e.current.teamHref ? (
                        <Link href={e.current.teamHref} className="text-[var(--text)] hover:text-[var(--accent)] hover:underline">
                          {e.current.canonical || e.current.champion}
                        </Link>
                      ) : (
                        <span className="text-[var(--text)]">{e.current.canonical || e.current.champion}</span>
                      )}
                      {e.current.year != null && <span className="text-[var(--text-dim)]"> ({e.current.year})</span>}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ChampionsView({ current, index }: { current: ChampRow[]; index: CompIndexEntry[] }) {
  const [view, setView] = useSessionState<"current" | "all">("champions-view", "current");
  const btn = (v: "current" | "all", label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
        view === v
          ? "bg-[var(--accent)] text-white"
          : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex gap-2 mb-5" role="group" aria-label="Champions view">
        {btn("current", "Current")}
        {btn("all", "All-Time")}
      </div>
      {view === "current" ? <ChampionsTable rows={current} /> : <AllTimeIndex index={index} />}
    </div>
  );
}
