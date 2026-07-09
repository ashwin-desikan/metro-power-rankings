import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import {
  getCflMeta,
  getAllCflFranchises,
  getCflGreyCupHistory,
  getLatestCflStandings,
  monogramFor,
  type CflFranchise,
} from "@/lib/cfl";
import { getLiveCflStandings } from "@/lib/cflStandings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import CflAllTimeTable from "./CflAllTimeTable";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

export const dynamicParams = false;

const PAGE_PATH = "/teams/cfl";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "CFL";
const PAGE_DESCRIPTION =
  "Live Canadian Football League standings, an all-time franchise table, and the complete Grey Cup final history since 1909.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function Monogram({ f, size = 26 }: { f: CflFranchise | { slug: string; name: string }; size?: number }) {
  const m = monogramFor(f);
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{ background: m.bg, color: m.fg, width: size, height: size * 0.62, fontSize: m.mono.length > 2 ? 9 : 11, letterSpacing: "0.02em" }}
    >
      {m.mono}
    </span>
  );
}

export default async function CflPage() {
  const meta = getCflMeta();
  const franchises = getAllCflFranchises();
  const history = getCflGreyCupHistory();
  const bySlug = new Map(franchises.map(f => [f.slug, f]));
  const reigning = history[0];

  // Prefer the live CFL.ca feed for the current season; fall back to the workbook
  // (latest completed season) if the season hasn't started or the fetch fails.
  const live = await getLiveCflStandings(new Date().getFullYear());
  const standings = live ?? getLatestCflStandings();
  const isLive = standings.source === "cfl.ca";
  const asOf = standings.fetched_at
    ? new Date(standings.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-6 text-[var(--text-muted)]">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">← All Sports</Link>
      </nav>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Canadian Football · Canada</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Canadian Football League</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Nine teams across two divisions play three downs on a wider, longer field for the Grey Cup,
          first contested in 1909 and the oldest trophy in North American professional football still
          competed for annually. This portal tracks every franchise since 1945, plus the full Grey Cup
          roll back to 1909.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{meta.active_teams}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{meta.grey_cup_games}</strong> Grey Cups ({meta.grey_cup_first_year}–{meta.latest_season})</div>
          {reigning && <div>Reigning champion: <strong className="text-[var(--text)] text-sm">{reigning.champion}</strong></div>}
        </div>
      </header>

      <HubNav
        items={[
          { label: `${standings.year} Standings`, href: "#standings" },
          { label: "All-Time Table", href: "#alltime" },
          { label: "Grey Cup Finals", href: "#finals" },
        ]}
      />

      {/* ── Standings (live via CFL.ca when in season, else latest workbook season) ── */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h2 id="standings" className="text-xl font-bold">{standings.year} Standings</h2>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />Live
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-dim)] mb-4">
          {isLive
            ? <>Live regular-season standings from CFL.ca, refreshed hourly{asOf ? ` · as of ${asOf}` : ""}.</>
            : <>Final regular-season standings for {standings.year}, by division. ★ Grey Cup champion · ⊳ reached the Grey Cup · • clinched playoffs.</>}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {standings.divisions.map(div => {
            const sortedRows = [...div.rows].sort((a, b) => b.pts - a.pts || b.pct - a.pct);
            return (
              <div key={div.division} className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="px-3 py-2 text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
                  {div.division} Division
                </div>

                {/* Mobile: one stacked card per team instead of an 8-column table. */}
                <div className="grid grid-cols-1 gap-2 p-2 sm:hidden">
                  {sortedRows.map(r => (
                    <div
                      key={`${r.slug}-card`}
                      className="rounded-lg border p-3"
                      style={{ borderColor: "var(--border)", backgroundColor: r.grey_cup ? "rgba(212,175,55,0.07)" : "var(--bg-card)" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest name={bySlug.get(r.slug)?.name ?? r.team} size={22} fallback={<Monogram f={bySlug.get(r.slug) ?? { slug: r.slug, name: r.team }} />} />
                        <Link href={`/teams/cfl/${r.slug}`} className={`truncate hover:text-[var(--accent)] transition-colors ${r.grey_cup ? "font-semibold" : "font-medium text-sm"}`}>{bySlug.get(r.slug)?.name ?? r.team}</Link>
                        {r.grey_cup ? <span className="text-yellow-400 text-xs leading-none flex-shrink-0" title="Grey Cup champion">★</span>
                          : r.gc_final ? <span className="text-[var(--text-dim)] text-[11px] leading-none flex-shrink-0" title="Reached the Grey Cup">⊳</span>
                          : r.play_app ? <span className="text-[var(--text-dim)] text-[10px] leading-none flex-shrink-0" title="Clinched playoffs">•</span> : null}
                      </div>
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs tabular-nums mt-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Record</div>
                          <div>{r.w}-{r.l}-{r.t}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PTS</div>
                          <div className="font-semibold">{r.pts}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">GP</div>
                          <div className="text-[var(--text-muted)]">{r.gp}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PF</div>
                          <div className="text-[var(--text-dim)]">{r.pf}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">PA</div>
                          <div className="text-[var(--text-dim)]">{r.pa}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <table className="w-full text-sm tabular-nums hidden sm:table">
                  <thead>
                    <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      <th className="text-left py-2 px-3 font-medium">Team</th>
                      <th className="text-right py-2 px-2 font-medium">GP</th>
                      <th className="text-right py-2 px-2 font-medium">W</th>
                      <th className="text-right py-2 px-2 font-medium">L</th>
                      <th className="text-right py-2 px-2 font-medium">T</th>
                      <th className="text-right py-2 px-2 font-medium">PTS</th>
                      <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">PF</th>
                      <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">PA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(r => (
                      <tr key={r.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: r.grey_cup ? "rgba(212,175,55,0.07)" : undefined }}>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <TeamCrest name={bySlug.get(r.slug)?.name ?? r.team} size={22} fallback={<Monogram f={bySlug.get(r.slug) ?? { slug: r.slug, name: r.team }} />} />
                            <Link href={`/teams/cfl/${r.slug}`} className={`hover:text-[var(--accent)] transition-colors ${r.grey_cup ? "font-semibold" : ""}`}>{bySlug.get(r.slug)?.name ?? r.team}</Link>
                            {r.grey_cup ? <span className="text-yellow-400 text-xs leading-none" title="Grey Cup champion">★</span>
                              : r.gc_final ? <span className="text-[var(--text-dim)] text-[11px] leading-none" title="Reached the Grey Cup">⊳</span>
                              : r.play_app ? <span className="text-[var(--text-dim)] text-[10px] leading-none" title="Clinched playoffs">•</span> : null}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.gp}</td>
                        <td className="py-2 px-2 text-right">{r.w}</td>
                        <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.l}</td>
                        <td className="py-2 px-2 text-right text-[var(--text-muted)]">{r.t}</td>
                        <td className="py-2 px-2 text-right font-semibold">{r.pts}</td>
                        <td className="py-2 px-2 text-right text-[var(--text-dim)] text-xs hidden sm:table-cell">{r.pf}</td>
                        <td className="py-2 px-3 text-right text-[var(--text-dim)] text-xs hidden sm:table-cell">{r.pa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-dim)] mt-2">
          {isLive
            ? "Live source: CFL.ca official standings (hourly cache). Falls back to the project workbook if unavailable."
            : "Sourced from the project workbook. The live CFL.ca feed appears here automatically once the season is underway."}
        </p>
      </section>

      {/* ── All-time table (filterable) ──────────────────────────────────── */}
      <section className="mb-12">
        <h2 id="alltime" className="text-xl font-bold mb-3">All-Time Table</h2>
        <CflAllTimeTable franchises={franchises} />
      </section>

      {/* ── Grey Cup honor roll ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 id="finals" className="text-xl font-bold mb-4">Grey Cup Finals</h2>
        {/* Mobile: one stacked card per final instead of a 5-column table. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {history.map(g => (
            <div
              key={`${g.year}-${g.game}-card`}
              className="rounded-lg border p-3"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--text-dim)]">{g.year}</span>
                <span className="text-xs tabular-nums">{g.score}{g.ot ? " (OT)" : ""}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                <CrestIcon name={g.champion} size={16} className="flex-shrink-0" />
                {g.champion_slug ? <Link href={`/teams/cfl/${g.champion_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.champion}</Link> : g.champion}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">vs</span>
                <CrestIcon name={g.runner_up} size={14} className="flex-shrink-0" />
                {g.runner_up_slug ? <Link href={`/teams/cfl/${g.runner_up_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.runner_up}</Link> : g.runner_up}
              </div>
              {g.city && <div className="text-[10px] text-[var(--text-dim)] mt-1.5">{g.city}</div>}
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-3 font-medium">Year</th>
                <th className="text-left py-2 px-2 font-medium">Champion</th>
                <th className="text-right py-2 px-2 font-medium">Score</th>
                <th className="text-left py-2 px-2 font-medium">Runner-up</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Host city</th>
              </tr>
            </thead>
            <tbody>
              {history.map(g => (
                <tr key={`${g.year}-${g.game}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 text-[var(--text-muted)]">{g.year}</td>
                  <td className="py-1.5 px-2 font-medium">
                    <CrestIcon name={g.champion} size={16} className="mr-1.5 align-middle" />
                    {g.champion_slug ? <Link href={`/teams/cfl/${g.champion_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.champion}</Link> : g.champion}
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs">{g.score}{g.ot ? " (OT)" : ""}</td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">
                    <CrestIcon name={g.runner_up} size={16} className="mr-1.5 align-middle" />
                    {g.runner_up_slug ? <Link href={`/teams/cfl/${g.runner_up_slug}`} className="hover:text-[var(--accent)] transition-colors">{g.runner_up}</Link> : g.runner_up}
                  </td>
                  <td className="py-1.5 px-3 text-[var(--text-dim)] text-xs hidden sm:table-cell">{g.city}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
