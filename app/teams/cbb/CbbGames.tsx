"use client";

import { useState } from "react";
import type { CbbGame } from "@/lib/cbbShared";
import CbbGamesTable from "./CbbGamesTable";

export default function CbbGames({ topOverall, byDecade, linkSlugs }: { topOverall: CbbGame[]; byDecade: Record<string, CbbGame[]>; linkSlugs: string[] }) {
  const decades = Object.keys(byDecade).sort((a, b) => Number(b) - Number(a));
  const [sel, setSel] = useState<string>("all");
  const games = sel === "all" ? topOverall : (byDecade[sel] ?? []);
  const chip = (key: string, label: string) => (
    <button key={key} onClick={() => setSel(key)} className="text-xs px-2.5 py-1 rounded-full border transition-colors"
      style={sel === key ? { background: "var(--accent)", color: "var(--bg)", borderColor: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chip("all", "Top 50 all-time")}
        {decades.map((dd) => chip(dd, `${dd}s`))}
      </div>
      <CbbGamesTable games={games} linkSlugs={linkSlugs} />
    </div>
  );
}
