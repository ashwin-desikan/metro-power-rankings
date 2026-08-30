"use client";

// MLS standings table for the MLS league hub. MLS has no promotion/relegation
// and splits into Eastern/Western conferences, so this renders a combined
// table by default with a toggle to the two-conference view. Honor flags
// (Supporters Shield, made playoffs, conference final, MLS Cup final, MLS Cup)
// come straight from the workbook columns CH/CE/CA/BW/BX.

import { useState } from "react";
import Link from "next/link";
import { monogramForFootball } from "@/lib/football-colors";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import type { MlsStanding } from "@/lib/football";
import { Tabs } from "@/app/teams/_shared/Tabs";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

const MLS_CREST_ALIAS: Record<string, string> = { "LA Galaxy": "Los Angeles Galaxy" };

function TeamCell({ row }: { row: MlsStanding }) {
  const name = row.cur_name;
  const m = monogramForFootball(name, row.slug ?? undefined);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <TeamCrest
        name={MLS_CREST_ALIAS[name] ?? name}
        size={18}
        fallback={<span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>}
      />
      {row.slug ? <Link href={`/teams/football/${row.slug}`} className="hover:underline font-medium truncate">{name}</Link> : <span className="font-medium truncate">{name}</span>}
    </span>
  );
}

function Honors({ row }: { row: MlsStanding }) {
  const badges: React.ReactNode[] = [];
  if (row.supporters_shield) {
    badges.push(
      <span key="ss" title="Supporters' Shield (best regular-season record)">
        <Badge variant="champion">★ Shield</Badge>
      </span>
    );
  }
  // Deepest playoff result, most significant first.
  if (row.mls_cup) {
    badges.push(
      <span key="cup" title="MLS Cup champion">
        <Badge variant="champion">★ MLS Cup</Badge>
      </span>
    );
  } else if (row.mls_cup_app) {
    badges.push(<span key="final" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border" style={{ borderColor: "rgba(245,215,110,0.5)", color: "#b58900" }} title="Reached the MLS Cup final">MLS Cup Final</span>);
  } else if (row.playoff_sf) {
    badges.push(
      <span key="sf" title="Reached the conference final (final four)">
        <Badge color={{ bg: "rgba(99,102,241,0.12)", fg: "#818cf8" }}>Conf Final</Badge>
      </span>
    );
  } else if (row.playoffs) {
    badges.push(<span key="po" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Qualified for the MLS Cup Playoffs">Playoffs</span>);
  }
  if (badges.length === 0) return <span className="text-[var(--text-dim)]">—</span>;
  return <span className="inline-flex flex-wrap gap-1">{badges}</span>;
}

function Table({ rows, showConf, showHonors }: { rows: MlsStanding[]; showConf: boolean; showHonors: boolean }) {
  return (
    <ResponsiveTable
      variant="list"
      className="rounded-xl border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      mobileNoun="clubs"
      mobileRows={rows.map((r, i) => (
        <RankRow
          key={r.cur_name}
          rank={i + 1}
          name={
            <>
              <TeamCell row={r} />
              {showHonors && (
                <span className="flex-shrink-0 inline-flex items-center gap-1"><Honors row={r} /></span>
              )}
            </>
          }
          sub={<>{showConf && r.conference ? <>{r.conference} · </> : null}{r.w}-{r.d}-{r.l} · {r.gd > 0 ? `+${r.gd}` : r.gd} GD</>}
          right={r.pts ?? "—"}
          rightSub="pts"
          highlight={r.supporters_shield || r.mls_cup}
        />
      ))}
    >
      <table className="w-full min-w-[640px] text-sm tabular-nums" data-sticky-col="2">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <th className="text-left py-2 px-3 font-medium">#</th>
            <th className="text-left py-2 px-3 font-medium">Team</th>
            {showConf && <th className="text-left py-2 px-2 font-medium">Conf</th>}
            <th className="text-right py-2 px-2 font-medium">W</th>
            <th className="text-right py-2 px-2 font-medium">D</th>
            <th className="text-right py-2 px-2 font-medium">L</th>
            <th className="text-right py-2 px-2 font-medium">Pts</th>
            <th className="text-right py-2 px-2 font-medium">GF</th>
            <th className="text-right py-2 px-2 font-medium">GA</th>
            <th className="text-right py-2 px-2 font-medium">GD</th>
            {showHonors && <th className="text-left py-2 px-3 font-medium">Honors</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.cur_name} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: r.supporters_shield ? "rgba(245,215,110,0.06)" : undefined }}>
              <td className="py-1.5 px-3 text-[var(--text-muted)]">{i + 1}</td>
              <td className="py-1.5 px-3"><TeamCell row={r} /></td>
              {showConf && <td className="py-1.5 px-2 text-[var(--text-muted)]">{r.conference ?? "—"}</td>}
              <td className="py-1.5 px-2 text-right">{r.w}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.d}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.l}</td>
              <td className="py-1.5 px-2 text-right font-semibold">{r.pts ?? "—"}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.gs}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.ga}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              {showHonors && <td className="py-1.5 px-3"><Honors row={r} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTable>
  );
}

export default function MlsStandings({ standings, conferences, showHonors = true }: { standings: MlsStanding[]; conferences: string[]; showHonors?: boolean }) {
  const [view, setView] = useState<"combined" | "conference">("combined");
  // The rows arrive grouped by conference (Eastern block, then Western); the
  // Combined view must rank across both. MLS tiebreakers: points, then wins,
  // then goal difference, then goals for. Reused for the per-conference filter
  // so each conference table stays point-ordered too.
  const ordered = [...standings].sort(
    (a, b) => (b.pts ?? 0) - (a.pts ?? 0) || b.w - a.w || b.gd - a.gd || b.gs - a.gs
  );
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold">Current standings</h2>
        <Tabs
          aria-label="Standings view"
          active={view}
          onChange={(key) => setView(key as "combined" | "conference")}
          items={[
            { key: "combined", label: "Combined" },
            { key: "conference", label: "By conference" },
          ]}
        />
      </div>

      {view === "combined" ? (
        <Table rows={ordered} showConf showHonors={showHonors} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {conferences.map((conf) => {
            const rows = ordered.filter((r) => r.conference === conf);
            return (
              <div key={conf}>
                <h3 className="text-sm font-semibold mb-2">{conf} Conference</h3>
                <Table rows={rows} showConf={false} showHonors={showHonors} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
