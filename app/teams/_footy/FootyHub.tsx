import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { fgFor, type FootyFranchise, type FootyMeta, type FootyLadder, type FootyGFResult } from "@/lib/_footy";
import type { FootyStandingsView } from "@/lib/_footyStandings";
import type { FootyCopy } from "./config";
import FootyAllTimeTable from "./FootyAllTimeTable";

function Badge({ color, color2, abbr, size = 26 }: { color: string; color2: string; abbr: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{ background: color, color: color.startsWith("#") ? fgFor(color) : "#fff",
        width: size, height: size * 0.62, fontSize: abbr.length > 2 ? 9 : 11,
        letterSpacing: "0.02em", boxShadow: `inset 0 0 0 1.5px ${color2}` }}>{abbr}</span>
  );
}

export default function FootyHub({ copy, meta, ladder, franchises, gfHistory, live }: {
  copy: FootyCopy; meta: FootyMeta; ladder: FootyLadder;
  franchises: FootyFranchise[]; gfHistory: FootyGFResult[]; live?: FootyStandingsView;
}) {
  const lg = copy.league;
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const reigning = gfHistory[0];
  const totalPrem = franchises.reduce((s, f) => s + f.premierships, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-6 text-[var(--text-muted)]">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">← All Sports</Link>
      </nav>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">{copy.eyebrow}</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{copy.fullName}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">{copy.blurb}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{meta.active_teams}</strong> current clubs</div>
          <div><strong className="text-[var(--text)] text-sm">{totalPrem}</strong> premierships ({meta.founded}–{meta.latest_season})</div>
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> clubs all-time</div>
          {reigning && <div>Reigning {copy.premiersWord.toLowerCase()}: <strong className="text-[var(--text)] text-sm">{reigning.champion}</strong></div>}
        </div>
      </header>

      <HubNav items={[
        ...(live && live.rows.length ? [{ label: `${live.year} Live`, href: "#live" }] : []),
        { label: "All-Time Table", href: "#alltime" },
        { label: "Grand Finals", href: "#finals" },
      ]} />

      {/* ── Latest-season ladder ─────────────────────────────────────────── */}
      {live && live.rows.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 id="live" className="text-xl font-bold">{live.year} {copy.ladderWord}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />Live
            </span>
          </div>
          <p className="text-xs text-[var(--text-dim)] mb-4">Live {live.year} ladder from ESPN, refreshed hourly.</p>
          <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums min-w-[520px]">
              <thead>
                <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-right py-2 px-3 font-medium">#</th>
                  <th className="text-left py-2 px-2 font-medium">Club</th>
                  <th className="text-right py-2 px-2 font-medium">P</th>
                  <th className="text-right py-2 px-2 font-medium">W</th>
                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "L" : "D"}</th>
                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "D" : "L"}</th>
                  <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">For</th>
                  <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Agst</th>
                  <th className="text-right py-2 px-3 font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {live.rows.map((r, i) => {
                  const lf = r.slug ? bySlug.get(r.slug) : undefined;
                  return (
                    <tr key={r.slug ?? r.name ?? i} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 px-3 text-right text-[var(--text-muted)]">{r.rank ?? i + 1}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {lf && <Badge color={lf.color} color2={lf.color2} abbr={lf.abbr} />}
                          {lf ? <Link href={`/teams/${lg}/${lf.slug}`} className="hover:text-[var(--accent)] transition-colors">{lf.name}</Link> : <span>{r.name}</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.played}</td>
                      <td className="py-2 px-2 text-right">{r.w}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{lg === "afl" ? r.l : r.d}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{lg === "afl" ? r.d : r.l}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-dim)] text-xs hidden sm:table-cell">{r.pf}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-dim)] text-xs hidden sm:table-cell">{r.pa}</td>
                      <td className="py-2 px-2 text-right font-semibold">{r.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--text-dim)] mt-2">Live source: ESPN. All-time honours and records below are from the project workbook (afltables.com), complete through {ladder.year}.</p>
        </section>
      )}
      <section className="mb-12">
        <h2 id="alltime" className="text-xl font-bold mb-3">All-Time Table</h2>
        <FootyAllTimeTable league={lg} franchises={franchises.map((f) => ({
          slug: f.slug, name: f.name, active: f.active, premierships: f.premierships,
          minor_premierships: f.minor_premierships, gf_apps: f.gf_apps, finals_apps: f.finals_apps,
          seasons: f.seasons, w: f.w, d: f.d, l: f.l, win_pct: f.win_pct,
          title_years: f.title_years, color: f.color, color2: f.color2, abbr: f.abbr,
        }))} />
      </section>

      {/* ── Grand Final honor roll ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 id="finals" className="text-xl font-bold mb-4">Grand Finals</h2>
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm tabular-nums min-w-[560px]">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-3 font-medium">Year</th>
                <th className="text-left py-2 px-2 font-medium">{copy.premiersWord}</th>
                <th className="text-right py-2 px-2 font-medium">Score</th>
                <th className="text-left py-2 px-2 font-medium">Runner-up</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Venue</th>
              </tr>
            </thead>
            <tbody>
              {gfHistory.map((g) => (
                <tr key={g.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">{g.year}</td>
                  <td className="py-1.5 px-2 font-medium">
                    {g.stripped ? (
                      <span className="text-[var(--text-muted)]"><span className="line-through">{g.champion}</span> <span className="text-[10px] uppercase tracking-wide">stripped</span></span>
                    ) : (
                      <Link href={`/teams/${lg}/${g.champion_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.champion}</Link>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs">{g.drawn ? "drawn" : `${g.pf}–${g.pa}`}</td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">
                    {g.runner_up_slug ? <Link href={`/teams/${lg}/${g.runner_up_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.runner_up}</Link> : g.runner_up}
                  </td>
                  <td className="py-1.5 px-3 text-[var(--text-dim)] text-xs hidden sm:table-cell">{g.stadium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[10px] text-[var(--text-dim)]">
        Data sourced from <a href={meta.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-muted)] underline">{meta.source}</a>,
        the comprehensive AFL &amp; rugby league statistics archive. {copy.code} honours and ladders cover {meta.founded}–{meta.latest_season}.
      </p>
    </main>
  );
}
