import type { Metadata } from "next";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TopTeamChip from "@/app/teams/TopTeamChip";
import { getAllCfbSlugs, getCfbTeamBySlug, getCfbSeasons, getCfbAwards, getCfbRivalries, getCfbTeamGames, cfbMonogram } from "@/lib/cfb";
import CfbGamesTable from "../CfbGamesTable";

export const dynamicParams = false;
export function generateStaticParams() { return getAllCfbSlugs().map((slug) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getCfbTeamBySlug(slug);
  if (!t) return { title: "Program not found" };
  const path = `/teams/cfb/${slug}`;
  const titles = t.nat_champ_years.length ? `${t.nat_champ_years.length} national titles, ` : "";
  const desc = `${t.name} college football: ${titles}all-time ${t.w}-${t.l}${t.tie ? `-${t.tie}` : ""} (${t.pct.toFixed(3)}). Conference: ${t.conference}.`;
  return {
    title: `${t.name} — College Football`, description: desc, alternates: { canonical: path },
    openGraph: { title: `${t.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${t.name} | ${SITE_NAME}`, description: desc },
  };
}

function bowlEra(year: number): string | null {
  if (year >= 2014) return "CFP";
  if (year >= 1998) return "BCS";
  if (year >= 1995) return "BA";
  if (year >= 1992) return "BC";
  return null;
}
function bowlEraName(year: number): string {
  if (year >= 2014) return "College Football Playoff era";
  if (year >= 1998) return "Bowl Championship Series era";
  if (year >= 1995) return "Bowl Alliance era";
  if (year >= 1992) return "Bowl Coalition era";
  return "";
}
function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{v}</div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mt-0.5">{k}</div>
    </div>
  );
}

export default async function CfbTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getCfbTeamBySlug(slug);
  if (!t) notFound();
  const seasons = getCfbSeasons(slug);
  const games = getCfbTeamGames(slug);
  const awards = getCfbAwards(slug);
  const rivalries = getCfbRivalries(slug);
  const slugs = new Set(getAllCfbSlugs());
  const heismanCount = awards.filter((a) => /^\s*heisman trophy\s*$/i.test(a.award)).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/sports" className="hover:text-[var(--text)]">Sports</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/cfb" className="hover:text-[var(--text)]">College Football</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{t.name}</span>
      </nav>

      <header className="flex gap-5 items-start mb-8">
        <TeamCrest name={t.name} size={72} fallback={<div className="rounded-2xl grid place-items-center font-extrabold flex-shrink-0 text-xl text-white" style={{ background: t.color, width: 72, height: 72, boxShadow: `inset 0 0 0 3px ${t.color2}` }} aria-hidden>{cfbMonogram(t.name)}</div>} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{t.name}</h1>
        <ChampionBadge items={getCurrentChampionships(t.name, "American Football")} />
            {t.fbs_fcs && <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>{t.current_fbs ? "FBS" : t.fbs_fcs}</span>}
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
          {t.nat_champ_years.length > 0 && (
            <p className="text-sm mt-2"><span className="text-[var(--text-dim)]">National titles:</span> <span className="text-[var(--accent)] font-medium tabular-nums">{t.nat_champ_years.join(", ")}</span></p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-10">
        <Stat k="All-time" v={`${t.w}-${t.l}${t.tie ? `-${t.tie}` : ""}`} />
        <Stat k="Win %" v={t.pct.toFixed(3)} />
        <Stat k="National titles" v={t.nat_champ_years.length} />
        <Stat k="Conf titles" v={t.conf_titles} />
        <Stat k="Major bowls" v={t.maj_bowl} />
        <Stat k="Playoff apps" v={t.playoff_app} />
        <Stat k="Weeks at #1" v={t.weeks_at_1} />
        <Stat k="Heismans" v={heismanCount} />
      </div>

      {rivalries.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Rivalries</h2>
          <div className="flex flex-wrap gap-2">
            {rivalries.map((r, i) => (
              <div key={i} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                {r.rivalry && <span className="text-[var(--text-dim)] text-xs">{r.rivalry}</span>}
                {slugs.has(r.rival_slug)
                  ? <Link href={`/teams/cfb/${r.rival_slug}`} className="font-medium hover:text-[var(--accent)]">{r.rival}</Link>
                  : <span className="font-medium">{r.rival}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {games.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Greatest games</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">{t.name}&apos;s top games of all time by Game Score.</p>
          <CfbGamesTable games={games} linkSlugs={getAllCfbSlugs()} />
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Season by season <span className="text-xs font-normal text-[var(--text-dim)]">(major seasons)</span></h2>
        <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-xs sm:text-sm tabular-nums whitespace-nowrap [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                <th className="px-2 py-2">Year</th><th className="px-2 py-2">School</th><th className="px-2 py-2 text-right">Record</th>
                <th className="px-2 py-2">Conference</th><th className="px-2 py-2 hidden sm:table-cell">Div</th>
                <th className="px-2 py-2 text-right hidden md:table-cell">Conf</th><th className="px-2 py-2 text-center hidden lg:table-cell">Champ App</th><th className="px-2 py-2 text-center">Conf Champ</th>
                <th className="px-2 py-2 text-right">AP</th><th className="px-2 py-2 text-right hidden md:table-cell">Coach</th><th className="px-2 py-2 text-right hidden lg:table-cell">High</th>
                <th className="px-2 py-2">Bowl</th><th className="px-2 py-2 text-center">Natl</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((sn) => (
                <tr key={sn.year} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1.5"><a href={`https://www.sports-reference.com/cfb/years/${sn.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${sn.year} college football season on Sports Reference`}>{sn.year}</a></td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">{sn.school}</td>
                  <td className="px-2 py-1.5 text-right">{sn.w}-{sn.l}{sn.t ? `-${sn.t}` : ""}</td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">{sn.conference}</td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)] hidden sm:table-cell">{sn.division}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--text-muted)] hidden md:table-cell">{sn.conf_w || sn.conf_l || sn.conf_t ? `${sn.conf_w}-${sn.conf_l}${sn.conf_t ? `-${sn.conf_t}` : ""}` : ""}</td>
                  <td className="px-2 py-1.5 text-center hidden lg:table-cell">{sn.champ_app ? <span className="text-[var(--text-muted)]">✓</span> : ""}</td>
                  <td className="px-2 py-1.5 text-center">{sn.conf_champ ? <span className="text-[var(--accent)]">★</span> : ""}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--text-muted)]">{sn.fin_ap ? `#${sn.fin_ap}` : ""}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--text-muted)] hidden md:table-cell">{sn.fin_coach ? `#${sn.fin_coach}` : ""}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--text-dim)] hidden lg:table-cell">{sn.high_ap ? `#${sn.high_ap}` : ""}</td>
                  <td className="px-2 py-1.5">
                    {(sn.bowl || sn.major_bowl) ? (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {sn.bowl
                          ? <span className="text-[var(--text-muted)]">{sn.bowl}{sn.bowl_res ? ` (${sn.bowl_res})` : ""}</span>
                          : <span className="text-[var(--accent)]" title="Made a bowl game">✓</span>}
                        {sn.major_bowl && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}>Major</span>}
                        {sn.major_bowl && bowlEra(sn.year) && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded font-semibold" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={bowlEraName(sn.year)}>{bowlEra(sn.year)}</span>}
                      </span>
                    ) : ""}
                  </td>
                  <td className="px-2 py-1.5 text-center">{sn.nat_champ ? <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>National</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {awards.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-1">Award winners</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">{awards.length} major award winners and consensus All-Americans.</p>
          <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-2 py-2 w-14">Year</th><th className="px-2 py-2">Player</th><th className="px-2 py-2 w-12 hidden sm:table-cell">Pos</th><th className="px-2 py-2">Award</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--text-muted)]">{a.year}</td>
                    <td className="px-2 py-1.5 font-medium">{a.player}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)] hidden sm:table-cell">{a.pos}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">{a.award}{/^\s*heisman trophy\s*$/i.test(a.award) ? <span className="ml-1" style={{ color: "#d4af37" }} title="Heisman winner">★</span> : null}</td>
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
