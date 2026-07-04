"use client";

import { useState } from "react";
import SportsExplorer, { type TeamMarker } from "./SportsExplorer";

export default function SportsMapToggle({ teams, majorCount, otherCount }: { teams: TeamMarker[]; majorCount: number; otherCount: number }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: show ? "var(--accent)" : "var(--border)" }}
          aria-expanded={show}
        >
          <span aria-hidden>🗺️</span>
          <span>{show ? "Hide the map" : "Show the world map"}</span>
          <span className="text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{show ? "▲" : "▼"}</span>
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {teams.length.toLocaleString()} teams · {majorCount.toLocaleString()} major league · {otherCount.toLocaleString()} college &amp; second flight
        </span>
      </div>
      {show && (
        <div className="mt-4">
          <p className="text-[var(--text-dim)] text-xs mb-3">
            Filter by sport, league, or country; click a marker for the metro or team page. Gold rings are major leagues, slate are college and second flight.
          </p>
          <SportsExplorer teams={teams} />
        </div>
      )}
    </div>
  );
}
