"use client";

import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Tabs } from "@/app/teams/_shared/Tabs";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";

export type HubRow = { rank: number | null; name: string; slug: string | null; cells: (number | string)[]; champ?: boolean };
export type HubGroup = { label: string | null; rows: HubRow[] };
export type HubLeague = { id: number; name: string; level: number | null; groups: HubGroup[]; end_year?: number; hubSlug?: string | null };
export type HubCountry = { country: string; leagues: HubLeague[] };
export type HubConf = { confederation: string; countries: HubCountry[] };

const COLS = ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function ClubLabel({ r }: { r: HubRow }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <CrestIcon name={r.name} size={15} className="flex-shrink-0" />
      {r.slug ? (
        <Link href={`/teams/football/${r.slug}`} className="hover:text-[var(--accent)] truncate">{r.name}</Link>
      ) : (
        <span className="truncate">{r.name}</span>
      )}
      {r.champ && <span title="Champion" aria-label="Champion" className="flex-shrink-0 leading-none" style={{ color: "#f5b301" }}>★</span>}
    </span>
  );
}

function StandingsTable({ group }: { group: HubGroup }) {
  // Points (cells[7]) is the standings' argument — the column the table is
  // sorted by. max is this group's own maximum, computed once per group
  // (each StandingsTable call renders exactly one table), never per row.
  const ptsMax = Math.max(
    ...group.rows.map((r) => (typeof r.cells[7] === "number" ? (r.cells[7] as number) : 0)),
    1,
  );
  return (
    <ResponsiveTable
      compact
      variant="list"
      className="rounded-lg border"
      style={cardStyle}
      mobileRows={group.rows.map((r, i) => (
        <RankRow
          key={`${r.name}-${i}`}
          rank={r.rank ?? i + 1}
          name={<ClubLabel r={r} />}
          sub={<>{r.cells[0]} P · {r.cells[1]}-{r.cells[2]}-{r.cells[3]} · {typeof r.cells[6] === "number" && r.cells[6] > 0 ? `+${r.cells[6]}` : r.cells[6]} GD</>}
          right={r.cells[7]}
          rightSub="pts"
          highlight={r.champ}
        />
      ))}
    >
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
                <ClubLabel r={r} />
              </td>
              {r.cells.map((c, j) => (
                j === 7 ? (
                  <td key={j} className="py-1 px-1.5 text-right">
                    <DataBar v={typeof c === "number" ? c : null} max={ptsMax} width={88} label="points" />
                  </td>
                ) : (
                  <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{c}</td>
                )
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTable>
  );
}

function LeagueCard({ league, season }: { league: HubLeague; season?: string }) {
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle}>
      <summary className="cursor-pointer select-none px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">
          {league.hubSlug ? (
            <Link href={`/teams/football/leagues/${league.hubSlug}`} onClick={(e) => e.stopPropagation()} className="hover:text-[var(--accent)] hover:underline">{league.name}</Link>
          ) : league.name}
          {season && <span className="ml-2 font-normal text-[var(--text-dim)] tabular-nums">{league.end_year ?? +season.slice(0, 4) + 1}</span>}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {/* Visible hub link on the first line for leagues with a dedicated hub (Ashwin 2026-08-02). */}
          {league.hubSlug && (
            <Link
              href={`/teams/football/leagues/${league.hubSlug}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium whitespace-nowrap text-[var(--accent)] hover:underline"
            >
              Open hub →
            </Link>
          )}
          {league.level != null && <Badge variant="neutral">Tier {league.level}</Badge>}
        </span>
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

export default function Hub2027Client({ confs, season }: { confs: HubConf[]; season?: string }) {
  const [active, setActive] = useState(confs[0]?.confederation ?? "");
  const current = confs.find((c) => c.confederation === active) ?? confs[0];

  return (
    <div>
      <Tabs
        className="mb-4"
        aria-label="Confederation"
        active={active}
        onChange={setActive}
        items={confs.map((c) => {
          const n = c.countries.reduce((a, k) => a + k.leagues.length, 0);
          return {
            key: c.confederation,
            label: c.confederation,
            badge: <span className="tabular-nums text-[var(--text-dim)] ml-1">{n}</span>,
          };
        })}
      />

      {!current || current.countries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] italic">No live tables in this confederation yet.</p>
      ) : (
        <div className="space-y-6">
          {current.countries.map((k) => (
            <section key={k.country}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{k.country}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {k.leagues.map((l) => <LeagueCard key={l.id} league={l} season={season} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
