"use client";
import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Tabs } from "@/app/teams/_shared/Tabs";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

export type RankedClub = { rank: number; name: string; slug: string | null; country: string; mp: number; w: number; d: number; l: number; form: number; ped: number; tb: number; score: number; deltaRank?: number | null };
export type CoefCountry = { rank: number; country: string; seasons: Record<string, number | null>; coef: number };
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const DASH = "—";
// Year-over-year rank movement (positive = climbed toward #1). null = not ranked last season.
function DeltaCell({ d }: { d?: number | null }) {
  if (d == null) return <span className="text-[var(--text-dim)]">·</span>;
  if (d === 0) return <span className="text-[var(--text-dim)]">–</span>;
  return <span style={{ color: d > 0 ? "#22c55e" : "#ef4444" }}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>;
}

export default function RankingTable({ clubs, countries, clubSeasons, pendingNote, top5 }: { clubs: RankedClub[]; countries: CoefCountry[]; clubSeasons: string[]; pendingNote?: string; top5?: string[] }) {
  const clubsPending = clubs.length === 0;
  const [tab, setTab] = useState<"clubs" | "countries">(clubsPending ? "countries" : "clubs");
  const [country, setCountry] = useState<string>("");
  const rankOf = new Map(countries.map((c) => [c.country, c.rank]));
  const filterCountries = Array.from(new Set(clubs.map((c) => c.country))).sort((a, b) => (rankOf.get(a) ?? 999) - (rankOf.get(b) ?? 999) || a.localeCompare(b));
  const top5Set = new Set(top5 ?? []);
  const rows = country === "__NOT_TOP5__"
    ? clubs.filter((c) => !top5Set.has(c.country)).slice(0, 100)
    : country
      ? clubs.filter((c) => c.country === country)
      : clubs.slice(0, 100);
  const anyDelta = clubs.some((c) => c.deltaRank != null);
  return (
    <div>
      <Tabs
        className="mb-3"
        aria-label="Ranking view"
        active={tab}
        onChange={(k) => setTab(k as "clubs" | "countries")}
        items={[
          { key: "clubs", label: "Club ranking" },
          { key: "countries", label: "Country coefficients" },
        ]}
      />
      {tab === "clubs" ? (
        clubsPending ? (
          <div className="rounded-xl border px-4 py-8 text-center" style={cardStyle}>
            <p className="text-sm font-medium">Club power ranking opens with the season</p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-md mx-auto">{pendingNote ?? "The club power ranking needs match results to compute. The first published ranking lands around the first September international break; in the meantime, the country coefficients that seed this season are in the tab above."}</p>
          </div>
        ) : (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs">
            <label htmlFor="country" className="text-[var(--text-muted)]">Country</label>
            <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="">All countries (top 100)</option>
              {top5 && top5.length > 0 && <option value="__NOT_TOP5__">Outside the top-5 leagues</option>}
              {filterCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-[var(--text-dim)]">{rows.length} shown</span>
          </div>
          <ResponsiveTable
            compact
            variant="list"
            className="rounded-xl border"
            style={cardStyle}
            mobileRows={rows.map((c) => (
              <RankRow
                key={`${c.rank}-${c.name}`}
                rank={c.rank}
                name={
                  <>
                    <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                    {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)] truncate">{c.name}</Link> : <span className="truncate">{c.name}</span>}
                    {c.deltaRank != null && c.deltaRank !== 0 && (
                      <span className="flex-shrink-0 text-[10px]" style={mono}><DeltaCell d={c.deltaRank} /></span>
                    )}
                  </>
                }
                sub={<>{c.country} · {c.mp} P · {c.w}-{c.d}-{c.l}{c.tb > 0 ? ` · +${c.tb.toFixed(2)} trophy` : ""}</>}
                right={c.score.toFixed(3)}
                rightSub="score"
              />
            ))}
          >
            {/* Club is col 2 without the Δ column, col 3 with it; the sticky-col
                override only exists for col 2, so skip it when Δ renders (the
                table is desktop-only via ResponsiveTable, so this is belt-and-
                braces for any future mobile exposure). */}
            <table className="w-full text-xs min-w-[540px]" data-sticky-col={anyDelta ? undefined : "2"}><thead><tr className="text-left text-[var(--text-muted)]">
              <th className="py-2 px-2 font-medium text-right">#</th>{anyDelta && <th className="py-2 px-1 font-medium text-right" title="Rank change vs the previous season">Δ</th>}<th className="py-2 px-2 font-medium">Club</th><th className="py-2 px-2 font-medium">Country</th>
              <th className="py-2 px-2 font-medium text-right">P</th><th className="py-2 px-2 font-medium text-right">W</th><th className="py-2 px-2 font-medium text-right">D</th><th className="py-2 px-2 font-medium text-right">L</th>
              <th className="py-2 px-2 font-medium text-right">Form</th><th className="py-2 px-2 font-medium text-right">Ped</th><th className="py-2 px-2 font-medium text-right">Trophy</th><th className="py-2 px-2 font-medium text-right">Score</th></tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={`${c.rank}-${c.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
                  {anyDelta && <td className="py-1.5 px-1 text-right tabular-nums" style={mono}><DeltaCell d={c.deltaRank} /></td>}
                  <td className="py-1.5 px-2 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><CrestIcon name={c.name} size={14} className="flex-shrink-0" />{c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-muted)]">{c.country}</td>
                  {[c.mp, c.w, c.d, c.l].map((v, j) => <td key={j} className="py-1.5 px-2 text-right tabular-nums" style={mono}>{v}</td>)}
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.form.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.ped.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--accent)]" style={mono}>{c.tb > 0 ? `+${c.tb.toFixed(2)}` : "—"}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{c.score.toFixed(3)}</td>
                </tr>))}</tbody>
            </table>
          </ResponsiveTable>
        </>
        )
      ) : (
        <ResponsiveTable
          compact
          variant="list"
          className="rounded-xl border"
          style={cardStyle}
          mobileRows={countries.map((c) => {
            const latest = clubSeasons[clubSeasons.length - 1];
            const latestVal = latest != null ? c.seasons[latest] : null;
            return (
              <RankRow
                key={c.country}
                rank={c.rank}
                name={<span className="truncate">{c.country}</span>}
                sub={latestVal != null ? <>{latest}: {latestVal.toFixed(3)}</> : undefined}
                right={c.coef.toFixed(3)}
                rightSub="coef"
              />
            );
          })}
        >
          <table className="w-full text-xs min-w-[440px]" data-sticky-col="2"><thead><tr className="text-left text-[var(--text-muted)]">
            <th className="py-2 px-2 font-medium text-right">#</th><th className="py-2 px-2 font-medium">Association</th>
            {clubSeasons.map((s) => <th key={s} className="py-2 px-2 font-medium text-right">{s}</th>)}<th className="py-2 px-2 font-medium text-right">Coef</th></tr></thead>
            <tbody>{countries.map((c) => (
              <tr key={c.country} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
                <td className="py-1.5 px-2 font-medium whitespace-nowrap">{c.country}</td>
                {clubSeasons.map((s) => <td key={s} className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.seasons[s] == null ? DASH : (c.seasons[s] as number).toFixed(3)}</td>)}
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{c.coef.toFixed(3)}</td>
              </tr>))}</tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
