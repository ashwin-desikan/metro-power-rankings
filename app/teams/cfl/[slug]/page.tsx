import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCflFranchiseBySlug,
  getAllCflSlugs,
  getCflSeasons,
  getCflGreyCupFinals,
  monogramFor,
  type CflStandingRow,
  type CflSeason,
} from "@/lib/cfl";
import { getLiveCflStandings } from "@/lib/cflStandings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TopTeamChip from "@/app/teams/TopTeamChip";

export const dynamicParams = false;
export function generateStaticParams() {
  return getAllCflSlugs().map(slug => ({ slug }));
}

function titleCase(slug: string): string {
  return slug.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = getCflFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
  const path = `/teams/cfl/${slug}`;
  const desc = `${f.name}${f.active ? "" : " (defunct)"}: ${f.grey_cups} Grey Cup${f.grey_cups === 1 ? "" : "s"}, ${f.gc_finals} Grey Cup final appearance${f.gc_finals === 1 ? "" : "s"}, all-time CFL record ${f.w}-${f.l}-${f.t} (${f.win_pct.toFixed(3)}) over ${f.seasons} seasons since ${f.first_year}.`;
  return {
    title: `${f.name}${f.active ? "" : " (defunct)"}`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${f.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${f.name} | ${SITE_NAME}`, description: desc },
  };
}

function StatCell({ v, k, sub }: { v: string; k: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold tracking-tight">{v}</div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-0.5">{k}</div>
      {sub && <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );
}

// Postseason badge for a CFL season row.
function seasonBadge(s: { grey_cup: boolean; gc_final: boolean; play_app: boolean; playoff_result: string }) {
  if (s.grey_cup) return { label: "Grey Cup", bg: "#d4af37", color: "#1a1408" };
  if (s.gc_final) return { label: "Lost Grey Cup", bg: "#a07a30", color: "#fff" };
  if (s.playoff_result) return { label: s.playoff_result.replace(/^Lost\s+/, "Lost "), bg: "rgba(78,205,196,0.16)", color: "var(--accent)" };
  if (s.play_app) return { label: "Playoffs", bg: "rgba(255,255,255,0.05)", color: "var(--text-muted)" };
  return null;
}

type SeasonRow = CflSeason & { is_live?: boolean };

export default async function CflTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = getCflFranchiseBySlug(slug);
  if (!f) notFound();
  const seasons = getCflSeasons(slug);
  const finals = getCflGreyCupFinals(slug);
  const mono = monogramFor(f);
  const yearsLabel = `${f.first_year}–${f.active ? "present" : f.last_year}`;

  // Live current-season row (from cfl.ca, hourly) for active franchises.
  const liveYear = new Date().getFullYear();
  const live = f.active ? await getLiveCflStandings(liveYear) : null;
  let liveRow: CflStandingRow | null = null;
  let liveDiv = "";
  let liveRank = 0;
  if (live) {
    for (const d of live.divisions) {
      const idx = d.rows.findIndex(r => r.slug === slug);
      if (idx >= 0) { liveRow = d.rows[idx]; liveDiv = d.division; liveRank = idx + 1; break; }
    }
  }

  // Prepend the live season to the season-by-season table (unless the workbook
  // already has that year). Marked is_live so it renders as in-progress.
  const liveSeason: SeasonRow | null =
    liveRow && !seasons.some(s => s.year === liveYear)
      ? {
          year: liveYear, division: liveDiv, team: f.name,
          w: liveRow.w, l: liveRow.l, t: liveRow.t, pct: liveRow.pct,
          pf: liveRow.pf, pa: liveRow.pa,
          play_app: false, gc_final: false, grey_cup: false, playoff_result: "",
          is_live: true,
        }
      : null;
  const allSeasons: SeasonRow[] = liveSeason ? [liveSeason, ...seasons] : seasons;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/sports" className="hover:text-[var(--text)]">Sports</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/cfl" className="hover:text-[var(--text)]">CFL</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.name}</span>
      </nav>

      <div className="mb-4">
        <Link href="/teams/cfl" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span aria-hidden>&larr;</span><span>All CFL franchises</span>
        </Link>
      </div>

      <header className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="rounded-full grid place-items-center font-extrabold flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 80, height: 80, fontSize: 22 }} aria-hidden>
          {mono.mono}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.name}</h1>
        <ChampionBadge items={getCurrentChampionships(f.name, "Canadian Football")} />
            <TopTeamChip names={[f.name]} metro={null} />
            <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded" style={{ background: f.active ? "rgba(78,205,196,0.16)" : "rgba(120,120,140,0.18)", color: f.active ? "var(--accent)" : "var(--text-dim)" }}>
              {f.active ? "Active" : "Defunct"}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            <span className="text-[var(--text-dim)]">Active:</span> <span className="text-[var(--text)]">{yearsLabel}</span>
            {f.divisions.length > 0 && <> {" · "}<span className="text-[var(--text-dim)]">Division{f.divisions.length > 1 ? "s" : ""}:</span> <span className="text-[var(--text)]">{f.divisions.join(", ")}</span></>}
            {f.metro_slug && <> {" · "}<Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{titleCase(f.metro_slug)} metro →</Link></>}
          </p>
          {liveRow && (
            <p className="text-sm mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />Live {liveYear}
              </span>
              <span className="text-[var(--text)] font-semibold">{liveRow.w}-{liveRow.l}-{liveRow.t}</span>
              <span className="text-[var(--text-dim)]">· {liveRow.pts} pts · {ordinal(liveRank)} in the {liveDiv} Division</span>
            </p>
          )}
          {f.aka.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">Also known as: {f.aka.join(", ")}</p>
          )}
        </div>
      </header>

      <RivalriesSection rivals={getRivalries(f.name, "Canadian Football", "CFL")} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
        <StatCell v={f.grey_cups.toString()} k="Grey Cups" sub={f.title_years.length ? `Last ${f.title_years[f.title_years.length - 1]}` : undefined} />
        <StatCell v={f.gc_finals.toString()} k="GC Final apps" />
        <StatCell v={`${f.w}-${f.l}-${f.t}`} k="All-time record" />
        <StatCell v={f.win_pct.toFixed(3)} k="Win pct" />
        <StatCell v={f.seasons.toString()} k="Seasons" />
        <StatCell v={yearsLabel} k="Years" />
      </div>

      {allSeasons.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Season-by-season</h2>
          {/* Mobile: one stacked card per season instead of a 10-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {allSeasons.map((s) => {
              const b = seasonBadge(s);
              return (
                <div
                  key={`${s.year}-${s.is_live ? "live" : "wb"}-card`}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: s.grey_cup ? "rgba(212,175,55,0.07)" : s.is_live ? "rgba(34,197,94,0.06)" : "var(--bg-card)",
                    fontStyle: s.is_live ? "italic" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: s.grey_cup ? "#d4af37" : undefined }}>
                      {s.year} <span className="font-normal text-[var(--text-dim)] text-xs">· {s.division} Division</span>
                    </span>
                    {s.is_live
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />In progress</span>
                      : b ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                      : null}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{s.team}</div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs tabular-nums mt-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Record</div>
                      <div>{s.w}-{s.l}-{s.t}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pct</div>
                      <div>{s.pct.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PF-PA</div>
                      <div className="text-[var(--text-dim)]">{s.pf}-{s.pa}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-3 font-medium">Year</th>
                  <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Team</th>
                  <th className="text-left py-2 px-2 font-medium">Div</th>
                  <th className="text-right py-2 px-2 font-medium">W</th>
                  <th className="text-right py-2 px-2 font-medium">L</th>
                  <th className="text-right py-2 px-2 font-medium">T</th>
                  <th className="text-right py-2 px-2 font-medium">Pct</th>
                  <th className="text-right py-2 px-2 font-medium hidden md:table-cell">PF</th>
                  <th className="text-right py-2 px-2 font-medium hidden md:table-cell">PA</th>
                  <th className="text-left py-2 px-3 font-medium">Postseason</th>
                </tr>
              </thead>
              <tbody>
                {allSeasons.map((s) => {
                  const b = seasonBadge(s);
                  return (
                    <tr
                      key={`${s.year}-${s.is_live ? "live" : "wb"}`}
                      className="border-b last:border-b-0"
                      style={{
                        borderColor: "var(--border)",
                        background: s.grey_cup ? "rgba(212,175,55,0.07)" : s.is_live ? "rgba(34,197,94,0.06)" : undefined,
                        fontStyle: s.is_live ? "italic" : undefined,
                      }}
                    >
                      <td className="py-1.5 px-3" style={{ fontWeight: s.grey_cup || s.is_live ? 600 : undefined, color: s.grey_cup ? "#d4af37" : undefined }}>{s.year}</td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)] text-xs hidden sm:table-cell">{s.team}</td>
                      <td className="py-1.5 px-2 text-[var(--text-dim)] text-xs">{s.division}</td>
                      <td className="py-1.5 px-2 text-right">{s.w}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.l}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.t}</td>
                      <td className="py-1.5 px-2 text-right">{s.pct.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{s.pf}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{s.pa}</td>
                      <td className="py-1.5 px-3">
                        {s.is_live
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />In progress</span>
                          : b ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                          : <span className="text-[var(--text-dim)]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {liveSeason && (
            <p className="text-[10px] text-[var(--text-dim)] mt-2">{liveYear} row is live from CFL.ca, refreshed hourly. Records from 1945 are from the project workbook.</p>
          )}
        </section>
      )}

      {finals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Grey Cup Final Appearances</h2>
          {/* Mobile: one stacked card per final instead of a 6-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {finals.map((g, i) => {
              const won = g.result === "W";
              return (
                <div
                  key={`${g.year}-${i}-card`}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--border)", backgroundColor: won ? "rgba(212,175,55,0.07)" : "var(--bg-card)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{g.year} <span className="font-normal text-[var(--text-dim)] text-xs">· {g.game}</span></span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0" style={{ background: won ? "#d4af37" : "#475569", color: won ? "#1a1408" : "#fff" }}>
                      {won ? "Won" : "Lost"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1.5">
                    vs {g.opponent_slug ? <Link href={`/teams/cfl/${g.opponent_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.opponent}</Link> : g.opponent}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs tabular-nums mt-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                      <div>{g.pf}–{g.pa}{g.ot ? " (OT)" : ""}</div>
                    </div>
                    {(g.venue || g.city) && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Venue</div>
                        <div className="text-[var(--text-dim)]">{g.venue}{g.city ? `, ${g.city}` : ""}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-3 font-medium">Year</th>
                  <th className="text-left py-2 px-2 font-medium">Game</th>
                  <th className="text-left py-2 px-2 font-medium">Result</th>
                  <th className="text-right py-2 px-2 font-medium">Score</th>
                  <th className="text-left py-2 px-2 font-medium">Opponent</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Venue</th>
                </tr>
              </thead>
              <tbody>
                {finals.map((g, i) => {
                  const won = g.result === "W";
                  return (
                    <tr key={`${g.year}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: won ? "rgba(212,175,55,0.07)" : undefined }}>
                      <td className="py-1.5 px-3 font-medium">{g.year}</td>
                      <td className="py-1.5 px-2 text-[var(--text-dim)] text-xs">{g.game}</td>
                      <td className="py-1.5 px-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: won ? "#d4af37" : "#475569", color: won ? "#1a1408" : "#fff" }}>
                          {won ? "Won" : "Lost"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs">{g.pf}–{g.pa}{g.ot ? " (OT)" : ""}</td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)]">
                        {g.opponent_slug ? <Link href={`/teams/cfl/${g.opponent_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.opponent}</Link> : g.opponent}
                      </td>
                      <td className="py-1.5 px-3 text-[var(--text-dim)] text-xs hidden sm:table-cell">{g.venue}{g.city ? `, ${g.city}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-8">
        {f.active ? "CFL franchise." : "Defunct CFL franchise."} Season records from 1945; Grey Cup history from 1909.
        Source: <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
      </p>
    </main>
  );
}
