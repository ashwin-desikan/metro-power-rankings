import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllFranchiseSlugs,
  getFranchiseBySlug,
  getChampionships,
  getChampionshipAppearances,
  getStadiumHistory,
  getAwards,
  getPresidentsTrophies,
  getSeasons,
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
  TROPHY_FULL_NAMES,
  ORIGINAL_SIX,
  postseasonResult,
  seasonLabel,
  lossColumnsForYear,
  type Season,
  type AwardWinner,
} from "@/lib/nhl";
import { getCurrentNhlStandings } from "@/lib/nhl-standings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";
import SeasonsByTeamTable from "./SeasonsByTeamTable";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllFranchiseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
  const url = `${BASE_URL}/teams/nhl/${f.slug}`;
  const desc =
    `${f.display_name}: ${f.championships} Stanley Cup${f.championships === 1 ? "" : "s"}, ${f.best_record_seasons} Presidents' Trophy / Best-Record seasons, all-time pts pct ${f.pts_pct.toFixed(3)}, founded ${f.founded}. Plays at ${f.current_arena_canonical || f.current_arena_season}, ${f.metro}.`;
  return {
    title: f.display_name,
    description: desc,
    alternates: { canonical: `/teams/nhl/${f.slug}` },
    openGraph: { title: `${f.display_name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${f.display_name} | ${SITE_NAME}`, description: desc },
  };
}

const AWARD_ORDER: string[] = [
  "Hart", "Norris", "Vezina", "Calder",
  "Conn Smythe", "Adams", "Selke", "Lady Byng",
];

export default async function NhlTeamPage({ params }: Props) {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) notFound();

  const championships = getChampionships(slug);
  const champApps = getChampionshipAppearances(slug);
  const stadiumHistory = getStadiumHistory(slug);
  const awards = getAwards(slug);
  const presidents = getPresidentsTrophies(slug);
  const seasons = getSeasons(slug);
  const mono = monogramFor(slug);
  const logo = logoUrlFor(slug);

  const stanleyCups = championships.filter(c => c.era === "stanley");
  const avcoCups = championships.filter(c => c.era === "avco");
  const finalsLost = champApps.filter(c => c.result === "Lost");

  // Group awards by trophy
  const awardsByType: Record<string, AwardWinner[]> = {};
  for (const a of awards) {
    if (!awardsByType[a.trophy]) awardsByType[a.trophy] = [];
    awardsByType[a.trophy].push(a);
  }

  const isOriginalSix = ORIGINAL_SIX.has(f.name);

  // Top Team chip — does this franchise show up as the named pick for any metro?
  const topTeam = findTopTeamForName(
    [f.display_name, `${f.city} ${f.team}`, f.team, f.name],
    f.metro,
  );

  // Live in-progress row (current season). Pull from ESPN standings.
  const standings = await getCurrentNhlStandings();
  const liveRow = standings.by_canonical[f.canonical];
  const liveSeasonYear = standings.season_year;

  // Workbook may already carry a row for the current season. If yes, the
  // workbook row wins (matches the convention from NBA/MLB).
  const currentInWorkbook = seasons.find(s => s.year === liveSeasonYear);
  const showLiveRow = liveSeasonYear > 0 &&
    liveRow &&
    liveRow.games_played > 0 &&
    !currentInWorkbook;
  const liveFetchedDate = (() => {
    if (!standings.fetched_at) return "";
    try {
      return new Date(standings.fetched_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch { return ""; }
  })();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-3 flex items-center gap-3 flex-wrap">
        <Link href="/teams/nhl" className="hover:text-[var(--accent)]">← All NHL franchises</Link>
        {f.metro && f.metro_slug && (
          <Link href={`/rankings/${f.metro_slug}`} className="hover:text-[var(--accent)]">
            {f.metro} →
          </Link>
        )}
      </div>

      {/* Hero */}
      <header className="mb-8">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-shrink-0">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logo} alt="" className="w-16 h-16 object-contain" />
            ) : mono ? (
              <span
                className="inline-grid place-items-center rounded-full flex-shrink-0 font-bold"
                style={{ background: mono.bg, color: mono.fg, width: 64, height: 64, fontSize: 18 }}
                aria-hidden
              >
                {mono.mono}
              </span>
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{f.display_name}</h1>
            <div className="text-sm text-[var(--text-muted)] mb-2">
              Founded {f.founded ?? "—"}
              {f.metro && (
                <> · Metro area <Link href={`/rankings/${f.metro_slug}`} className="hover:text-[var(--accent)]">{f.metro}</Link></>
              )}
              {f.current_arena_canonical && (
                <> · <Link href={`/rankings/${f.metro_slug}#map`} className="hover:text-[var(--accent)]">{f.current_arena_canonical}</Link></>
              )}
              {isOriginalSix && (
                <> · <span title="Original Six (1942-1967)" className="text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded" style={{ background: "#3a2e1a", color: "#d4af37" }}>O6</span></>
              )}
            </div>

            {/* Trophy chip ladder */}
            <div className="flex flex-wrap gap-2 items-center mb-2">
              {Array.from({ length: f.championships }).map((_, i) => {
                const c = championships[i];
                const era = c?.era || "stanley";
                const colors = era === "avco" ? TITLE_COLORS.avco : TITLE_COLORS.stanley;
                return (
                  <span
                    key={`cup-${i}`}
                    title={c ? `${c.year} ${era === "avco" ? "Avco Cup" : "Stanley Cup"} — ${c.city} ${c.team}` : ""}
                    className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {c ? `'${String(c.year).slice(-2)}` : "Cup"}
                  </span>
                );
              })}
              {f.championships === 0 && (
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">No Stanley Cup wins</span>
              )}
            </div>

            {/* Secondary chip row: Cup Finals losses + Presidents' Trophy */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
              <span>
                <strong className="text-[var(--text)]">{f.champ_appearances}</strong> Stanley Cup Final apps
                {finalsLost.length > 0 && <> ({finalsLost.length} lost)</>}
              </span>
              <span>
                <strong className="text-[var(--text)]">{f.sf_appearances}</strong> Conference / SF apps
              </span>
              <span title="Best regular-season record. Trophy named in 1985-86; workbook flags best record across all eras.">
                <strong className="text-[var(--text)]">{f.best_record_seasons}</strong> Presidents' Trophy / Best Reg Record
              </span>
              <span>
                <strong className="text-[var(--text)]">{f.division_titles}</strong> Division titles
              </span>
              <span>
                <strong className="text-[var(--text)]">{f.playoff_appearances}</strong> Playoff apps
              </span>
            </div>

            {/* Wikipedia / Wikidata */}
            {(f.wikipedia_url || f.wikidata_qid) && (
              <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
                {f.wikipedia_url && (
                  <a href={f.wikipedia_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline" title="Open on Wikipedia">
                    Wikipedia ↗
                  </a>
                )}
                {f.wikidata_qid && (
                  <a href={`https://www.wikidata.org/wiki/${f.wikidata_qid}`} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline" title="Open on Wikidata">
                    Wikidata ↗
                  </a>
                )}
              </div>
            )}

            {/* Top Team chip — does this franchise win the named metro slot? */}
            {topTeam && f.metro_slug && (
              <div className="mt-3">
                <Link
                  href={`/rankings/${f.metro_slug}#${topTeamAnchorId(topTeam.metro)}`}
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded hover:underline"
                  style={{ background: "#3a2e1a", color: "#d4af37" }}
                >
                  Top Team of {topTeam.metro}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Awards block */}
      {Object.keys(awardsByType).length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Major trophies</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Player + coach awards earned while with the franchise. Sortable by trophy. Spelling normalized for historic typos (Conn Smythe, Jack Adams).
          </p>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {AWARD_ORDER.filter(t => awardsByType[t]).map(t => {
              const winners = awardsByType[t];
              return (
                <div
                  key={t}
                  className="rounded-lg border p-3"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold" title={TROPHY_FULL_NAMES[t]}>{t}</h3>
                    <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] tabular-nums">{winners.length}</span>
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                    {winners.slice(0, 10).map((w, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2">
                        <span className="truncate">{w.player}</span>
                        <span className="text-[var(--text-dim)]">{w.year}</span>
                      </li>
                    ))}
                    {winners.length > 10 && (
                      <li className="text-[10px] text-[var(--text-dim)] italic">+ {winners.length - 10} more</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Presidents' Trophy / Best Reg. Record list */}
      {presidents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Presidents' Trophy & Best Regular-Season Record seasons</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Workbook flags every season where this franchise had the league's top regular-season record. The formal Presidents' Trophy was introduced for the 1985-86 season; pre-1986 rows are best-record honors across the pre-trophy era.
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] tabular-nums">
            {presidents.map(p => (
              <li key={p.year}>
                <span className="font-semibold" style={{ color: "#c0c0c0" }}>{seasonLabel(p.year)}</span>
                <span className="text-[var(--text-dim)]"> · {p.pts} pts</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Season-by-season + live in-progress row */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Season-by-season</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Reverse chronological. Ties column visible through the 2004-05 lockout; OTL absorbs shootout losses post-2005 (workbook convention; the public NHL site keeps them separate).
        </p>
        <SeasonsByTeamTable
          seasons={seasons}
          liveRow={showLiveRow ? {
            year: liveSeasonYear,
            w: liveRow.wins,
            l: liveRow.losses,
            otl: liveRow.ot_losses,
            pts: liveRow.points,
            pts_pct: liveRow.pts_pct,
            gf: liveRow.goals_for,
            ga: liveRow.goals_against,
            gp: liveRow.games_played,
            asOf: liveFetchedDate,
          } : null}
        />
      </section>

      {/* Arena history */}
      {stadiumHistory.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Arena history</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Reverse chronological. Era-correct workbook name with current canonical name in parentheses when renamed.
          </p>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {stadiumHistory.map((a, i) => {
              const sameName = a.arena === a.arena_canonical || !a.arena_canonical;
              const range = a.start_year === a.end_year
                ? seasonLabel(a.start_year)
                : `${seasonLabel(a.start_year)} – ${seasonLabel(a.end_year)}`;
              return (
                <li key={i} className="py-2 flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{a.arena || "(unknown)"}</div>
                    {!sameName && (
                      <div className="text-[11px] text-[var(--text-dim)]">now: {a.arena_canonical}</div>
                    )}
                    {a.city && (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {a.city}{a.state ? `, ${a.state}` : ""}
                        {f.metro_slug && (
                          <> · <Link href={`/rankings/${f.metro_slug}#map`} className="hover:text-[var(--accent)]">map</Link></>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">{range}</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-10">
        Source: <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
        Workbook canonical key: <code className="text-[10px]">{f.canonical}</code>.
        {liveSeasonYear > 0 && (
          <> Live standings refresh from ESPN every hour. The static build refreshes daily at 08:00 UTC.</>
        )}
      </p>
    </main>
  );
}
