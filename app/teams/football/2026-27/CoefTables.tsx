"use client";
import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Tabs } from "@/app/teams/_shared/Tabs";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

// Ranking + coefficient tables for the LIVE 2026-27 hub. Deliberately not the
// shared 2025-26 RankingTable: that renders a COMPLETED season (club power
// ranking with each club's record) and 67 archive hubs import it, so widening
// it for live coefficient views would risk all of them for no gain.
//
// THREE DATASETS, and keeping them apart is the point of this component:
//   * Club coefficient - live UEFA five-year CLUB ranking (22/23-26/27).
//   * Country race     - live UEFA five-year ASSOCIATION ranking, same window.
//   * Access ranking   - the FROZEN 21/22-25/26 window that decided this
//                        season's slots. It does not move all season, so it is
//                        read at build time; the two live tables refresh daily
//                        from uefa-coefficients.json via ISR.
// Conflating the live race with the access window is the standard UEFA
// coefficient error. The tab labels and the sub-copy exist to prevent it.
//
// The Citizen of Nowhere club power ranking (0.65 form + 0.35 pedigree + 0.11
// current coefficient - losing penalty + trophies) needs match-level results
// and lands later in the season; its tab holds the placeholder until then.

export type CoefClubRow = {
  rank: number;
  name: string;
  slug: string | null;
  country: string | null;
  seasons: Record<string, number | null>;
  trank: number;
};

export type CoefCountryRow = {
  rank: number;
  country: string;
  seasons: Record<string, number | null>;
  coef: number;
};

export type PowerRow = {
  rank: number;
  name: string;
  slug: string | null;
  country: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  form: number;
  ped: number;
  wt: number;    // weight on THIS season: mp/(mp+k)
  tb: number;
  score: number;
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const DASH = "—";
const fmt = (v: number | null | undefined, dp = 3) => (v == null ? DASH : v.toFixed(dp));

// One country table, used for both the live race and the frozen access window.
function CountryTable({
  rows, seasons, current, valueLabel,
}: {
  rows: CoefCountryRow[]; seasons: string[]; current: string | null; valueLabel: string;
}) {
  const latest = seasons[seasons.length - 1];
  return (
    <ResponsiveTable
      compact
      variant="list"
      className="rounded-xl border"
      style={cardStyle}
      mobileNoun="associations"
      mobileRows={rows.map((c) => (
        <RankRow
          key={c.country}
          rank={c.rank}
          name={<span className="truncate">{c.country}</span>}
          sub={latest ? <>{latest}: {fmt(c.seasons[latest])}</> : undefined}
          right={fmt(c.coef)}
          rightSub={valueLabel}
        />
      ))}
    >
      <table className="w-full text-xs min-w-[440px]" data-sticky-col="2"><thead><tr className="text-left text-[var(--text-muted)]">
        <th className="py-2 px-2 font-medium text-right">#</th><th className="py-2 px-2 font-medium">Association</th>
        {seasons.map((s) => (
          <th key={s} className="py-2 px-2 font-medium text-right" style={s === current ? { color: "var(--accent)" } : undefined}>{s}</th>
        ))}
        <th className="py-2 px-2 font-medium text-right">{valueLabel}</th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.country} className="border-t" style={{ borderColor: "var(--border)" }}>
            <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
            <td className="py-1.5 px-2 font-medium whitespace-nowrap">{c.country}</td>
            {seasons.map((s) => (
              <td key={s} className="py-1.5 px-2 text-right tabular-nums" style={{ ...mono, color: s === current ? "var(--accent)" : "var(--text-muted)" }}>{fmt(c.seasons[s])}</td>
            ))}
            <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{fmt(c.coef)}</td>
          </tr>))}</tbody>
      </table>
    </ResponsiveTable>
  );
}

export default function CoefTables({
  clubs, countries, liveSeasons, currentSeason,
  accessCountries, accessSeasons, accessWindow, powerNote, power, powerK,
}: {
  clubs: CoefClubRow[];
  countries: CoefCountryRow[];
  liveSeasons: string[];
  currentSeason: string;
  accessCountries: CoefCountryRow[];
  accessSeasons: string[];
  accessWindow: string;
  powerNote: string;
  power: PowerRow[];
  powerK: number;
}) {
  const live = clubs.length > 0 || countries.length > 0;
  const hasPower = power.length > 0;
  const [tab, setTab] = useState<string>(hasPower ? "power" : live ? "clubs" : "access");
  const [country, setCountry] = useState<string>("");

  const clubCountries = Array.from(new Set(clubs.map((c) => c.country).filter((c): c is string => !!c))).sort();
  const clubRows = country ? clubs.filter((c) => c.country === country) : clubs.slice(0, 100);
  const powerRows = power.slice(0, 100);
  const medianWt = hasPower ? [...power].sort((a, b) => a.wt - b.wt)[Math.floor(power.length / 2)].wt : 0;

  const items = [
    { key: "power", label: "Club power ranking" },
    ...(live ? [{ key: "clubs", label: "Club coefficient" }, { key: "race", label: "Country race" }] : []),
    { key: "access", label: "Access ranking" },
  ];

  return (
    <div>
      <Tabs className="mb-3" aria-label="Ranking view" active={tab} onChange={setTab} items={items} />

      {tab === "clubs" && (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            The UEFA club coefficient over {liveSeasons[0]} to {currentSeason}, recomputed daily from this
            season&rsquo;s European results. A club&rsquo;s total is floored at one fifth of its association&rsquo;s
            coefficient, so a club from a strong country never falls below that line.
          </p>
          <div className="flex items-center gap-2 mb-3 text-xs">
            <label htmlFor="coef-country" className="text-[var(--text-muted)]">Country</label>
            <select id="coef-country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="">All countries (top 100)</option>
              {clubCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-[var(--text-dim)]">{clubRows.length} shown</span>
          </div>
          <ResponsiveTable
            compact
            variant="list"
            className="rounded-xl border"
            style={cardStyle}
            mobileNoun="clubs"
            mobileRows={clubRows.map((c) => (
              <RankRow
                key={`${c.rank}-${c.name}`}
                rank={c.rank}
                name={
                  <>
                    <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                    {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)] truncate">{c.name}</Link> : <span className="truncate">{c.name}</span>}
                  </>
                }
                sub={<>{c.country ?? DASH} · {currentSeason}: {fmt(c.seasons[currentSeason], 2)}</>}
                right={fmt(c.trank, 2)}
                rightSub="coef"
              />
            ))}
          >
            <table className="w-full text-xs min-w-[620px]" data-sticky-col="2"><thead><tr className="text-left text-[var(--text-muted)]">
              <th className="py-2 px-2 font-medium text-right">#</th><th className="py-2 px-2 font-medium">Club</th><th className="py-2 px-2 font-medium">Country</th>
              {liveSeasons.map((s) => (
                <th key={s} className="py-2 px-2 font-medium text-right" style={s === currentSeason ? { color: "var(--accent)" } : undefined}>{s}</th>
              ))}
              <th className="py-2 px-2 font-medium text-right">Coef</th></tr></thead>
              <tbody>{clubRows.map((c) => (
                <tr key={`${c.rank}-${c.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
                  <td className="py-1.5 px-2 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><CrestIcon name={c.name} size={14} className="flex-shrink-0" />{c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-muted)]">{c.country ?? DASH}</td>
                  {liveSeasons.map((s) => (
                    <td key={s} className="py-1.5 px-2 text-right tabular-nums" style={{ ...mono, color: s === currentSeason ? "var(--accent)" : "var(--text-muted)" }}>{fmt(c.seasons[s], 2)}</td>
                  ))}
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{fmt(c.trank, 2)}</td>
                </tr>))}</tbody>
            </table>
          </ResponsiveTable>
        </>
      )}

      {tab === "race" && (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            The live five-year association ranking, {liveSeasons[0]} to {currentSeason}, recomputed daily.
            This is the race that decides how many places each country gets in {parseInt(currentSeason.slice(0, 2), 10) + 2}-
            {parseInt(currentSeason.slice(3), 10) + 2}, not the one that decided this season. Qualifying matches
            count half, and each country&rsquo;s total is its clubs&rsquo; points divided by clubs entered.
          </p>
          <CountryTable rows={countries} seasons={liveSeasons} current={currentSeason} valueLabel="Coef" />
        </>
      )}

      {tab === "access" && (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            The frozen {accessWindow} window. This is the ranking that decided how many clubs each country entered
            in 2026-27, and it does not move for the rest of the season. For the table that is moving, see the
            country race.
          </p>
          <CountryTable rows={accessCountries} seasons={accessSeasons} current={null} valueLabel="Coef" />
        </>
      )}

      {tab === "power" && (hasPower ? (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Every result weighted by the opponent&rsquo;s strength and the stage it was played at, plus five-year
            pedigree, the live coefficient and trophies won. The season is young, so each club&rsquo;s form is
            blended toward its pedigree with weight <span style={mono}>mp / (mp + {powerK})</span>. The
            <strong> Wt</strong> column is that weight: today the median club sits at {medianWt.toFixed(2)}, so
            most of this board is still pedigree rather than this season. It rises every week.
          </p>
          <ResponsiveTable
            compact
            variant="list"
            className="rounded-xl border"
            style={cardStyle}
            mobileNoun="clubs"
            mobileRows={powerRows.map((c) => (
              <RankRow
                key={`${c.rank}-${c.name}`}
                rank={c.rank}
                name={
                  <>
                    <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                    {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)] truncate">{c.name}</Link> : <span className="truncate">{c.name}</span>}
                  </>
                }
                sub={<>{c.country} · {c.mp} P · {c.w}-{c.d}-{c.l}{c.tb > 0 ? ` · +${c.tb.toFixed(2)} trophy` : ""}</>}
                right={c.score.toFixed(3)}
                rightSub="score"
              />
            ))}
          >
            <table className="w-full text-xs min-w-[600px]" data-sticky-col="2"><thead><tr className="text-left text-[var(--text-muted)]">
              <th className="py-2 px-2 font-medium text-right">#</th><th className="py-2 px-2 font-medium">Club</th><th className="py-2 px-2 font-medium">Country</th>
              <th className="py-2 px-2 font-medium text-right">P</th><th className="py-2 px-2 font-medium text-right">W</th><th className="py-2 px-2 font-medium text-right">D</th><th className="py-2 px-2 font-medium text-right">L</th>
              <th className="py-2 px-2 font-medium text-right">Form</th><th className="py-2 px-2 font-medium text-right">Ped</th>
              <th className="py-2 px-2 font-medium text-right" title="How much of this club's score is this season rather than pedigree">Wt</th>
              <th className="py-2 px-2 font-medium text-right">Trophy</th><th className="py-2 px-2 font-medium text-right">Score</th></tr></thead>
              <tbody>{powerRows.map((c) => (
                <tr key={`${c.rank}-${c.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.rank}</td>
                  <td className="py-1.5 px-2 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><CrestIcon name={c.name} size={14} className="flex-shrink-0" />{c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}</span></td>
                  <td className="py-1.5 px-2 whitespace-nowrap text-[var(--text-muted)]">{c.country}</td>
                  {[c.mp, c.w, c.d, c.l].map((v, j) => <td key={j} className="py-1.5 px-2 text-right tabular-nums" style={mono}>{v}</td>)}
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.form.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)]" style={mono}>{c.ped.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{c.wt.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--accent)]" style={mono}>{c.tb > 0 ? `+${c.tb.toFixed(2)}` : DASH}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={mono}>{c.score.toFixed(3)}</td>
                </tr>))}</tbody>
            </table>
          </ResponsiveTable>
        </>
      ) : (
        <div className="rounded-xl border px-4 py-8 text-center" style={cardStyle}>
          <p className="text-sm font-medium">Club power ranking opens later in the season</p>
          <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-md mx-auto">{powerNote}</p>
        </div>
      ))}
    </div>
  );
}
