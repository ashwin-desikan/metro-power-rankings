"use client";

import { useState } from "react";
import type { CfbGame } from "@/lib/cfbShared";
import CfbGamesTable from "./CfbGamesTable";

export default function CfbGames({ topOverall, byDecade, linkSlugs }: { topOverall: CfbGame[]; byDecade: Record<string, CfbGame[]>; linkSlugs: string[] }) {
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
        {decades.map((d) => chip(d, `${d}s`))}
      </div>
      <CfbGamesTable games={games} linkSlugs={linkSlugs} />
    </div>
  );
}
