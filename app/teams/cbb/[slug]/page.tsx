import type { Metadata } from "next";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TopTeamChip from "@/app/teams/TopTeamChip";
import { getAllCbbSlugs, getAllCbbTeams, getCbbTeamBySlug, getCbbSeasons, getCbbAwards, getCbbNba, getCbbTeamGames, cbbMonogram } from "@/lib/cbb";
import CbbGamesTable from "../CbbGamesTable";

// Pre-generate only current D1 programs (365 of 498 total). Historical/
// non-D1 programs are still reachable: dynamicParams=true renders them on
// first request and the long revalidate caches the result, same pattern as
// app/states/[slug]/page.tsx.
export const dynamicParams = true;
export const revalidate = 31536000; // 1 year — effectively static
export function generateStaticParams() {
  return getAllCbbTeams().filter((t) => t.current_d1).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getCbbTeamBySlug(slug);
  if (!t) return { title: "Program not found" };
  const path = `/teams/cbb/${slug}`;
  const titles = t.titles ? `${t.titles} NCAA titles, ` : "";
  const desc = `${t.name} men's college basketball: ${titles}all-time ${t.w}-${t.l} (${t.pct.toFixed(3)}), ${t.tour_app} NCAA tournament appearances, ${t.final4} Final Fours. Conference: ${t.conference}.`;
  return {
    title: `${t.name} — Men's College Basketball`, description: desc, alternates: { canonical: path },
    openGraph: { title: `${t.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${t.name} | ${SITE_NAME}`, description: desc },
  };
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{v}</div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mt-0.5">{k}</div>
    </div>
  );
}

export default async function CbbTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getCbbTeamBySlug(slug);
  if (!t) notFound();
  const seasons = getCbbSeasons(slug);
  const games = getCbbTeamGames(slug);
  const awards = getCbbAwards(slug);
  const nba = getCbbNba(slug);
  const allSlugs = getAllCbbSlugs();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/sports" className="hover:text-[var(--text)]">Sports</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/cbb" className="hover:text-[var(--text)]">Men&rsquo;s College Basketball</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{t.name}</span>
      </nav>

      <header className="flex gap-5 items-start mb-8">
        <TeamCrest name={t.name} size={72} fallback={<div className="rounded-2xl grid place-items-center font-extrabold flex-shrink-0 text-xl text-white" style={{ background: t.color, width: 72, height: 72, boxShadow: `inset 0 0 0 3px ${t.color2}` }} aria-hidden>{cbbMonogram(t.name)}</div>} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{t.name}</h1>
        <ChampionBadge items={getCurrentChampionships(t.name, "Basketball")} />
            {!t.current_d1 && <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>Former D-I</span>}
            <TopTeamChip names={[t.name]} metro={t.metro} className="ml-1" />
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {t.conference}
            {(t.city || t.metro || t.state) && <>{" · "}
              {t.city ? <>{t.city}, </> : null}
              {t.metro && (t.metro_slug ? <Link href={`/rankings/${t.metro_slug}`} className="text-[var(--accent)] hover:underline">{t.metro}</Link> : t.metro)}
              {t.state ? `, ${t.state}` : ""}
            </>}
          </p>
          {t.title_years.length > 0 && (
            <p className="text-sm mt-2"><span className="text-[var(--text-dim)]">NCAA titles:</span> <span className="text-[var(--accent)] font-medium tabular-nums">{t.title_years.join(", ")}</span></p>
          )}
        </div>
      </header>

      <RivalriesSection rivals={getRivalries(t.name, "Basketball", "NCAAM")} />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-10">
        <Stat k="All-time" v={`${t.w}-${t.l}`} />
        <Stat k="Win %" v={t.pct.toFixed(3)} />
        <Stat k="NCAA titles" v={t.titles} />
        <Stat k="Final Fours" v={t.final4} />
        <Stat k="Tourney apps" v={t.tour_app} />
        <Stat k="#1 seeds" v={t.seed1} />
        <Stat k="Weeks at #1" v={t.weeks_at_1} />
        <Stat k="All-Americans" v={t.all_americans} />
      </div>

      {games.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Greatest tournament games</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">{t.name}&rsquo;s top NCAA tournament games of all time by Game Score.</p>
          <CbbGamesTable games={games} linkSlugs={allSlugs} />
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Season by season</h2>
        <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-xs sm:text-sm tabular-nums whitespace-nowrap [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                <th className="px-2 py-2">Year</th><th className="px-2 py-2">School</th><th className="px-2 py-2 text-right">Record</th>
                <th className="px-2 py-2">Conference</th><th className="px-2 py-2 text-right hidden md:table-cell">Conf</th>
                <th className="px-2 py-2 text-right">AP</th><th className="px-2 py-2 text-right hidden lg:table-cell">SRS</th>
                <th className="px-2 py-2 text-center hidden sm:table-cell">Seed</th><th className="px-2 py-2">Tournament</th><th className="px-2 py-2 text-center">Natl</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((sn) => {
                const result = sn.champ ? "Champion" : sn.final4 ? "Final Four" : sn.elite8 ? "Elite Eight" : sn.sweet16 ? "Sweet 16" : sn.ncaa ? "NCAA tournament" : sn.nit ? "NIT" : "";
                return (
                  <tr key={sn.year} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5"><a href={`https://www.sports-reference.com/cbb/seasons/men/${sn.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${sn.year} season on Sports Reference`}>{sn.year}</a></td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">{sn.school}</td>
                    <td className="px-2 py-1.5 text-right">{sn.w}-{sn.l}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">{sn.conference}{sn.reg_champ ? <span className="text-[var(--accent)]" title="Regular-season conference champion"> ★</span> : ""}{sn.conf_tour_champ ? <span className="text-[var(--text-muted)]" title="Conference tournament champion"> ◆</span> : ""}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--text-muted)] hidden md:table-cell">{sn.conf_w || sn.conf_l ? `${sn.conf_w}-${sn.conf_l}` : ""}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--text-muted)]">{sn.ap_final ? `#${sn.ap_final}` : ""}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--text-dim)] hidden lg:table-cell">{sn.srs_rank ? `#${sn.srs_rank}` : ""}</td>
                    <td className="px-2 py-1.5 text-center text-[var(--text-muted)] hidden sm:table-cell">{sn.seed ? sn.seed : ""}</td>
                    <td className="px-2 py-1.5">{result && <span className={sn.champ ? "text-[var(--accent)] font-medium" : sn.final4 ? "text-amber-300" : "text-[var(--text-muted)]"}>{result}</span>}{sn.vacated ? <span className="ml-1 text-[9px] uppercase text-[var(--text-dim)]" title="Vacated">vac</span> : ""}</td>
                    <td className="px-2 py-1.5 text-center">{sn.champ ? <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>National</span> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {awards.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Consensus All-Americans</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">{awards.length} AP All-American selections.</p>
          <div className="max-h-[60vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-2 py-2 w-16">Year</th><th className="px-2 py-2">Player</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--text-muted)]">{a.year}</td>
                    <td className="px-2 py-1.5 font-medium">{a.player}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {nba.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-1">NBA first-round picks</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">{nba.length} first-round NBA draft selections from this program.</p>
          <div className="max-h-[60vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-2 py-2 w-20">Draft</th><th className="px-2 py-2">Player</th><th className="px-2 py-2 w-28 hidden sm:table-cell">Last college yr</th>
                </tr>
              </thead>
              <tbody>
                {nba.map((p, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--text-muted)]">{p.draft_year ?? ""}</td>
                    <td className="px-2 py-1.5 font-medium">{p.player}</td>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--text-dim)] hidden sm:table-cell">{p.year || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
