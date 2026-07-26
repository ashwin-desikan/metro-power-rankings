"use client";

import { useState } from "react";
import type { WLiveLeagueVM, WLiveCompVM } from "@/lib/wLive";
import WLiveTable from "./WLiveTable";
import WLiveComp from "./WLiveComp";

// The 2026-27 women's club-season hub, rendered inline at the top of the Women's
// Club page. A tab per live competition (Liga F, NWSL, FA WSL, UWCL); each panel
// carries a source badge (api-football / ESPN) and, where relevant, a placeholder
// note while a league awaits its 2026-27 table.

type Tab =
  | { kind: "league"; key: string; label: string; league: WLiveLeagueVM }
  | { kind: "comp"; key: string; label: string; comp: WLiveCompVM };

function Badge({ text, tone }: { text: string; tone: "live" | "espn" | "placeholder" }) {
  const styles =
    tone === "placeholder"
      ? { background: "rgba(148,163,184,0.18)", color: "#94a3b8" }
      : tone === "espn"
      ? { background: "rgba(59,130,246,0.16)", color: "#3b82f6" }
      : { background: "rgba(16,185,129,0.16)", color: "#10b981" };
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={styles}>
      {text}
    </span>
  );
}

export default function WLiveHub({ leagues, competition }: { leagues: WLiveLeagueVM[]; competition: WLiveCompVM | null }) {
  const tabs: Tab[] = [
    ...leagues.map((l): Tab => ({ kind: "league", key: `l${l.leagueId}`, label: l.name, league: l })),
    ...(competition ? [{ kind: "comp" as const, key: `c${competition.leagueId}`, label: "UWCL", comp: competition }] : []),
  ];
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md border transition ${on ? "font-semibold" : "text-[var(--text-muted)]"}`}
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                backgroundColor: on ? "var(--bg-card)" : "transparent",
                color: on ? "var(--accent)" : undefined,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        {current.kind === "league" ? (
          <LeaguePanel league={current.league} />
        ) : (
          <CompPanel comp={current.comp} />
        )}
      </div>
    </div>
  );
}

function LeaguePanel({ league }: { league: WLiveLeagueVM }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3 className="text-base font-semibold">{league.name}</h3>
        <span className="text-sm text-[var(--text-muted)]">{league.seasonLabel}</span>
        {league.placeholder ? (
          <Badge text="Last season" tone="placeholder" />
        ) : league.source === "ESPN" ? (
          <Badge text="Live · ESPN" tone="espn" />
        ) : (
          <Badge text="Live · api-football" tone="live" />
        )}
      </div>
      {league.placeholder && (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Showing the {league.seasonLabel} table while the 2026-27 season is published. It swaps automatically once the new season appears.
        </p>
      )}
      {league.hasRows ? (
        <WLiveTable groups={league.groups} />
      ) : (
        <p className="text-sm text-[var(--text-muted)] italic">Table appears once the {league.seasonLabel} season is under way.</p>
      )}
    </>
  );
}

function CompPanel({ comp }: { comp: WLiveCompVM }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h3 className="text-base font-semibold">{comp.name}</h3>
        <span className="text-sm text-[var(--text-muted)]">{comp.seasonLabel}</span>
        <Badge text="Live · api-football" tone="live" />
      </div>
      {comp.hasContent ? (
        <WLiveComp comp={comp} />
      ) : (
        <p className="text-sm text-[var(--text-muted)] italic">Group tables and fixtures appear once the {comp.seasonLabel} competition is under way.</p>
      )}
    </>
  );
}
