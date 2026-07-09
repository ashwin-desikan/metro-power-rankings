import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import { getAllCbbTeams, getAllCbbSlugs, getCbbTopGames, getCbbGamesByDecade, getCbbNationalChampions, getCbbDynastyLeaders, type CbbTeam } from "@/lib/cbb";
import CbbAllTimeTable from "./CbbAllTimeTable";
import CbbGames from "./CbbGames";

export const dynamicParams = false;
const PAGE_PATH = "/teams/cbb";
const PAGE_TITLE = "Men's College Basketball";
const PAGE_DESCRIPTION =
  "Every Division I men's basketball program through history: all-time records, NCAA titles and Final Fours, the 15-year dynasty rankings, the greatest tournament games by Game Score, and the NBA draft pipeline.";

export const metadata: Metadata = {
  title: PAGE_TITLE, description: PAGE_DESCRIPTION, alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function Leader({ title, rows }: { title: string; rows: { name: string; slug: string; val: number }[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">{title}</div>
      <ol className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.slug} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 text-[11px] tabular-nums text-[var(--text-dim)]">{i + 1}</span>
            <CrestIcon name={r.name} size={16} className="mr-1" /><Link href={`/teams/cbb/${r.slug}`} className="flex-1 truncate hover:text-[var(--accent)]">{r.name}</Link>
            <span className="tabular-nums text-[var(--text-muted)]">{r.val}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CbbHubPage() {
  const teams = getAllCbbTeams();
  const slugs = getAllCbbSlugs();
  const topGames = getCbbTopGames();
  const byDecade = getCbbGamesByDecade();
  const natChamps = getCbbNationalChampions();
  const dynasty = getCbbDynastyLeaders(15);
  const totalTitles = teams.reduce((n, t) => n + t.titles, 0);
  const lead = (key: (t: CbbTeam) => number, n = 15) =>
    [...teams].sort((a, b) => key(b) - key(a)).slice(0, n).map((t) => ({ name: t.name, slug: t.slug, val: key(t) }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">College Basketball</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Men&rsquo;s College Basketball</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every Division I program through history, with full all-time records and tournament honors, the 15-year dynasty rankings, the greatest tournament games by Game Score, and the NBA draft pipeline.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{teams.filter((t) => t.current_d1).length}</strong> current Division I</div>
          <div><strong className="text-[var(--text)] text-sm">{teams.length}</strong> programs all-time</div>
          <div><strong className="text-[var(--text)] text-sm">{totalTitles}</strong> NCAA titles tracked</div>
        </div>
      </header>

      <HubNav items={[{ label: "All-time", href: "#all-time" }, { label: "National champions", href: "#champions" }, { label: "Dynasties", href: "#dynasties" }, { label: "Greatest games", href: "#games" }, { label: "Polls & pipeline", href: "#polls" }]} />

      <section id="all-time" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">All-time programs</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Current Division I by default; switch to all programs in history. Click a column to sort.</p>
        <CbbAllTimeTable teams={teams} />
      </section>

      {natChamps.length > 0 && (
        <section id="champions" className="mb-12 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">National champions</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">NCAA tournament champions from 1939, with the retroactive pre-tournament selections (Helms, Premo-Porretta) labeled. Each row also shows the title-game runner-up and the other two Final Four teams. Tap a school to open its program page.</p>

          {/* Mobile: one card per tournament year. Same `natChamps` data as
              the desktop table, with champion/runner-up/Final Four stacked. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {natChamps.map((nc) => (
              <div key={`${nc.year}-card`} className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <a href={`https://www.sports-reference.com/cbb/seasons/men/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="text-xs tabular-nums text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a>
                </div>
                <div className="text-sm font-medium">
                  {nc.champs.map((c, i) => (
                    <span key={i}>
                      {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                      <CrestIcon name={c.name} size={14} className="mr-1 align-[-2px]" />{c.slug ? <Link href={`/teams/cbb/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}
                      {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                    <div>
                      {(nc.runner_up ?? []).length === 0 ? <span className="text-[var(--text-dim)]">&mdash;</span> : (nc.runner_up ?? []).map((r, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={r.name} size={13} className="mr-1 align-[-2px]" />{r.slug ? <Link href={`/teams/cbb/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Final Four</div>
                    <div className="text-[var(--text-muted)]">
                      {(nc.final_four ?? []).length === 0 ? <span className="text-[var(--text-dim)]">&mdash;</span> : (nc.final_four ?? []).map((f, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={f.name} size={13} className="mr-1 align-[-2px]" />{f.slug ? <Link href={`/teams/cbb/${f.slug}`} className="hover:text-[var(--accent)]">{f.name}</Link> : <span>{f.name}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-lg border hidden sm:block" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 w-16">Year</th>
                  <th className="px-3 py-2">National champion</th>
                  <th className="px-3 py-2">Runner-up</th>
                  <th className="px-3 py-2">Final Four</th>
                </tr>
              </thead>
              <tbody>
                {natChamps.map((nc) => (
                  <tr key={nc.year} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]"><a href={`https://www.sports-reference.com/cbb/seasons/men/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a></td>
                    <td className="px-3 py-1.5">
                      {nc.champs.map((c, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={c.name} size={14} className="mr-1 align-[-2px]" />{c.slug ? <Link href={`/teams/cbb/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link> : <span className="font-medium">{c.name}</span>}
                          {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-1.5">
                      {(nc.runner_up ?? []).length === 0 ? <span className="text-[var(--text-dim)]">&mdash;</span> : (nc.runner_up ?? []).map((r, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={r.name} size={13} className="mr-1 align-[-2px]" />{r.slug ? <Link href={`/teams/cbb/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">
                      {(nc.final_four ?? []).length === 0 ? <span className="text-[var(--text-dim)]">&mdash;</span> : (nc.final_four ?? []).map((f, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={f.name} size={13} className="mr-1 align-[-2px]" />{f.slug ? <Link href={`/teams/cbb/${f.slug}`} className="hover:text-[var(--accent)]">{f.name}</Link> : <span>{f.name}</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section id="dynasties" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Dynasties</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Seasons spent as the consensus #1 program on the 15-year rolling rankings, which blend tournament results, polls, and dominance over a decade-and-a-half window. The truest measure of a sustained reign.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Leader title="Years as the #1 program (15-yr)" rows={dynasty} />
          <Leader title="Most Final Fours" rows={lead((t) => t.final4)} />
        </div>
      </section>

      <section id="games" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">The greatest games</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Ranked by Game Score across all of NCAA tournament history, on the same scale as the other sports. Filter to a decade; each game shows the round, venue, and result.</p>
        <CbbGames topOverall={topGames} byDecade={byDecade} linkSlugs={slugs} />
      </section>

      <section id="polls" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Polls and the NBA pipeline</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">AP poll dominance since 1949, consensus All-Americans, and first-round NBA draft picks by program.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Leader title="Weeks at AP #1" rows={lead((t) => t.weeks_at_1)} />
          <Leader title="Most All-Americans" rows={lead((t) => t.all_americans)} />
          <Leader title="NBA first-round picks" rows={lead((t) => t.nba_first_round)} />
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Records, polls, tournament results, and games from a hand-curated NCAA Division I men&rsquo;s basketball database, 1896 to 2026. National champions before 1939 are retroactive Helms and Premo-Porretta selections. Game Score rates each game by the quality and stakes of the matchup.
      </p>
    </main>
  );
}
