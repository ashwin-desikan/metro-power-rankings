"use client";

import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

export type HubRow = { rank: number | null; name: string; slug: string | null; cells: (number | string)[]; champ?: boolean };
export type HubGroup = { label: string | null; rows: HubRow[] };
export type HubLeague = { id: number; name: string; level: number | null; groups: HubGroup[] };
export type HubCountry = { country: string; leagues: HubLeague[] };
export type HubConf = { confederation: string; countries: HubCountry[] };

const COLS = ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function StandingsTable({ group }: { group: HubGroup }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1 px-1.5 font-medium text-right">#</th>
            <th className="py-1 px-1.5 font-medium">Club</th>
            {COLS.map((c) => (
              <th key={c} className="py-1 px-1.5 font-medium text-right tabular-nums">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
              <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <CrestIcon name={r.name} size={15} className="flex-shrink-0" />
                  {r.slug ? (
                    <Link href={`/teams/football/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link>
                  ) : (
                    <span>{r.name}</span>
                  )}
                  {r.champ && <span title="Champion" aria-label="Champion" className="flex-shrink-0 leading-none" style={{ color: "#f5b301" }}>★</span>}
                </span>
              </td>
              {r.cells.map((c, j) => (
                <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeagueCard({ league }: { league: HubLeague }) {
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle}>
      <summary className="cursor-pointer select-none px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{league.name}</span>
        {league.level != null && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            Tier {league.level}
          </span>
        )}
      </summary>
      <div className="border-t px-3 py-3 space-y-4" style={{ borderColor: "var(--border)" }}>
        {league.groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.label}</div>}
            <StandingsTable group={g} />
          </div>
        ))}
      </div>
    </details>
  );
}

export default function Hub2027Client({ confs }: { confs: HubConf[] }) {
  const [active, setActive] = useState(confs[0]?.confederation ?? "");
  const current = confs.find((c) => c.confederation === active) ?? confs[0];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {confs.map((c) => {
          const n = c.countries.reduce((a, k) => a + k.leagues.length, 0);
          const on = c.confederation === active;
          return (
            <button
              key={c.confederation}
              onClick={() => setActive(c.confederation)}
              className={`px-3 py-1.5 text-sm rounded-md border transition ${on ? "font-semibold" : "text-[var(--text-muted)]"}`}
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                backgroundColor: on ? "var(--bg-card)" : "transparent",
                color: on ? "var(--accent)" : undefined,
              }}
            >
              {c.confederation} <span className="tabular-nums text-[var(--text-dim)]">{n}</span>
            </button>
          );
        })}
      </div>

      {!current || current.countries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">No live tables in this confederation yet.</p>
      ) : (
        <div className="space-y-6">
          {current.countries.map((k) => (
            <section key={k.country}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{k.country}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {k.leagues.map((l) => <LeagueCard key={l.id} league={l} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
