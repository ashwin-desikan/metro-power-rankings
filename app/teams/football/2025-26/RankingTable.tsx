"use client";
import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

export type RankedClub = { rank: number; name: string; slug: string | null; country: string; mp: number; w: number; d: number; l: number; form: number; ped: number; tb: number; score: number };
export type CoefCountry = { rank: number; country: string; seasons: Record<string, number | null>; coef: number };
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const DASH = "—";

export default function RankingTable({ clubs, countries, clubSeasons }: { clubs: RankedClub[]; countries: CoefCountry[]; clubSeasons: string[] }) {
  const [tab, setTab] = useState<"clubs" | "countries">("clubs");
  const [country, setCountry] = useState<string>("");
  const rankOf = new Map(countries.map((c) => [c.country, c.rank]));
  const filterCountries = Array.from(new Set(clubs.map((c) => c.country))).sort((a, b) => (rankOf.get(a) ?? 999) - (rankOf.get(b) ?? 999) || a.localeCompare(b));
  const rows = country ? clubs.filter((c) => c.country === country) : clubs.slice(0, 100);
  const tabBtn = (id: "clubs" | "countries", label: string) => (
    <button onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${tab === id ? "font-semibold" : "hover:text-[var(--text)]"}`}
      style={{ background: "var(--bg-card)", color: tab === id ? "var(--accent)" : "var(--text-muted)", borderColor: tab === id ? "var(--accent)" : "var(--border)" }}>{label}</button>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tabBtn("clubs", "Club ranking")}
        {tabBtn("countries", "Country coefficients")}
      </div>
      {tab === "clubs" ? (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs">
            <label htmlFor="country" className="text-[var(--text-muted)]">Country</label>
            <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="">All countries (top 100)</option>
              {filterCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-[var(--text-dim)]">{rows.length} shown</span>
          </div>
          <div className="rounded-xl border overflow-hidden" style={cardStyle}><div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[540px]"><thead><tr className="text-left text-[var(--text-muted)]">
              <th className="py-2 px-2 font-medium text-right">#</th><th className="py-2 px-2 font-medium">Club</th><th className="py-2 px-2 font-medium">Country</th>
              <th className="py-2 px-2 font-medium text-right">P</th><th className="py-2 px-2 font-medium text-right">W</th><th className="py-2 px-2 font-medium text-right">D</th><th className="py-2 px-2 font-medium text-right">L</th>
              <th className="py-2 px-2 font-medium text-right">Form</th><th className="py-2 px-2 font-medium text-right">Ped</th><th className="py-2 px-2 font-medium text-right">Trophy</th><th className="py-2 px-2 font-medium text-right">Score</th></tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={`${c.rank}-${c.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
                  <td className="py-1.5 px-2 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><CrestIcon name={c.name} size={14} className="flex-shrink-0" />{c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-muted)]">{c.country}</td>
                  {[c.mp, c.w, c.d, c.l].map((v, j) => <td key={j} className="py-1.5 px-2 text-right tabular-nums" style={mono}>{v}</td>)}
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.form.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.ped.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--accent)]" style={mono}>{c.tb > 0 ? `+${c.tb.toFixed(2)}` : "—"}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{c.score.toFixed(3)}</td>
                </tr>))}</tbody>
            </table>
          </div></div>
        </>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={cardStyle}><div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[440px]"><thead><tr className="text-left text-[var(--text-muted)]">
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
        </div></div>
      )}
    </div>
  );
}
