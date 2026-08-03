import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import ValuationChip from "@/app/teams/ValuationChip";
import GhostFranchiseTag from "@/app/teams/GhostFranchiseTag";
import { notFound } from "next/navigation";
import {
  getAllFranchiseSlugs,
  getFranchiseBySlug,
  getFranchiseByCanonical,
  getChampionships,
  getChampionshipAppearances,
  getStadiumHistory,
  getAwards,
  getSeasons,
  getTopGamesForTeam,
  getHistoricalSlugs,
  getHistoricalBySlug,
  getHistoricalSeasonsForSlug,
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
  abbreviateState,
  brefYearUrl,
  type Season,
  type HistoricalFranchise,
} from "@/lib/mlb";
import { getCurrentMlbStandings } from "@/lib/mlb-standings";
import SeasonsByTeamTable from "./SeasonsByTeamTable";
import { BASE_URL, SITE_NAME, serializeJsonLd, sportsTeamJsonLd } from "@/lib/seo";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const active = getAllFranchiseSlugs();
  const defunct = getHistoricalSlugs();
  return [...active, ...defunct].map((slug) => ({ slug }));
}

function defunctDisplayName(h: HistoricalFranchise): string {
  return h.display_name ?? `${h.city} ${h.name}`.trim();
}

function defunctYears(h: HistoricalFranchise): string {
  if (h.first_year && h.last_year) return `${h.first_year}–${h.last_year}`;
  if (h.first_year) return `${h.first_year}`;
  if (h.last_year) return `${h.last_year}`;
  return "—";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (f) {
    const url = `${BASE_URL}/teams/mlb/${f.slug}`;
    const desc =
      `${f.display_name}: ${f.championships} World Series titles, all-time record ${f.all_time_w}-${f.all_time_l} (${f.win_pct.toFixed(3)}), founded ${f.founding_year}. Plays in ${f.stadium}, ${f.metro}.`;
    return {
      title: f.display_name,
      description: desc,
      alternates: { canonical: `/teams/mlb/${f.slug}` },
      openGraph: { title: `${f.display_name} | ${SITE_NAME}`, description: desc, url, type: "website" },
      twitter: { card: "summary_large_image", title: `${f.display_name} | ${SITE_NAME}`, description: desc },
    };
  }
  const h = getHistoricalBySlug(slug);
  if (h) {
    const name = defunctDisplayName(h);
    const url = `${BASE_URL}/teams/mlb/${slug}`;
    const desc =
      `${name} (defunct, ${defunctYears(h)}): all-time record ${h.w}-${h.l} (${h.win_pct.toFixed(3)}), ${h.championships} World Series title${h.championships === 1 ? "" : "s"}, ${h.seasons} seasons in the ${h.league}.`;
    return {
      title: `${name} (defunct)`,
      description: desc,
      alternates: { canonical: `/teams/mlb/${slug}` },
      openGraph: { title: `${name} | ${SITE_NAME}`, description: desc, url, type: "website" },
      twitter: { card: "summary_large_image", title: `${name} | ${SITE_NAME}`, description: desc },
    };
  }
  return { title: "Franchise not found" };
}

// Order matches scripts/build-mlb-data.py AWARD_ORDER. The MLB workbook stores
// MVP / Cy Young / Rookie of the Year / Manager of the Year with the league
// in column G, so the ETL synthesises "AL MVP" / "NL MVP" etc. as the JSON
// key. If you add a new award, update this list AND the ETL in lockstep.
const AWARD_ORDER: string[] = [
  "AL MVP",
  "NL MVP",
  "AL Cy Young",
  "NL Cy Young",
  "AL Rookie of the Year",
  "NL Rookie of the Year",
  "AL Manager of the Year",
  "NL Manager of the Year",
  "WS MVP",
  "ALCS MVP",
  "NLCS MVP",
  "All-Star Game MVP",
  "Hank Aaron Award",
  "Comeback Player of the Year",
  "Babe Ruth Award",
  "Reliever of the Year Award",
  "Triple Crown Batter",
  "Triple Crown Pitcher",
];

function priorCitySummary(f: ReturnType<typeof getFranchiseBySlug>): string | null {
  if (!f || f.prior_cities.length === 0) return null;
  const distinct: string[] = [];
  for (const c of f.prior_cities) {
    for (const segment of c.split(/[/,]/)) {
      const trimmed = segment.trim();
      if (trimmed && trimmed !== f.city && !distinct.includes(trimmed)) {
        distinct.push(trimmed);
      }
    }
  }
  if (distinct.length === 0) return null;
  return distinct.join(", ");
}

export default async function FranchisePage({ params }: Props) {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) {
    const h = getHistoricalBySlug(slug);
    if (h) return <DefunctFranchisePage h={h} slug={slug} />;
    notFound();
  }

  const champs = getChampionships(f.canonical);
  const champAppearances = getChampionshipAppearances(f.canonical);
  const stadiums = getStadiumHistory(f.canonical);
  const awards = getAwards(f.canonical);
  const seasons = getSeasons(f.slug);
  const topGames = getTopGamesForTeam(f.slug);
  const mono = monogramFor(f.slug);
  const logo = logoUrlFor(f.slug);
  const formerly = priorCitySummary(f);

  // Top Team badge. Scan TOP_TEAMS by team name (not just by the
  // franchise's own metro) so cross-metro picks surface. Tie-break inside
  // the helper prefers a pick whose metro matches the franchise's own
  // metro when one exists. Pass MLB's display_name first (the city + team
  // form expected in the workbook) plus fallbacks.
  const topTeamPick = findTopTeamForName(
    [f.display_name, `${f.city} ${f.team}`, f.name, f.team],
    f.metro,
  );
  const franchiseCount = getAllFranchiseSlugs().length;
  const topTeamFranchiseMatch = topTeamPick !== null;


  // Live current-season standings from ESPN. Gate logic:
  //   1. ESPN must return a standings row for this franchise.
  //   2. That row must have games_played > 0 (so spring training / opening
  //      day rosters with 0-0 records don't surface).
  //   3. ESPN's season.year must equal the current calendar year, to avoid
  //      ESPN returning last year's final standings (which the workbook
  //      already covers cleanly) while a season transition is in progress.
  //
  // We intentionally do NOT gate on season_type here. ESPN MLB occasionally
  // returns regular-season standings with games_played > 0 while still
  // flagging season.type=1 ("spring") during early-April transitions. The
  // games_played guard is the right truth source.
  const standings = await getCurrentMlbStandings();
  const liveStanding = standings.by_canonical[f.canonical];
  const currentYear = new Date().getFullYear();
  const showLiveRow =
    !!liveStanding &&
    liveStanding.games_played > 0 &&
    standings.season_year === currentYear;
  const liveSeasonRow: (Season & { is_live: true }) | null = showLiveRow
    ? {
        year: standings.season_year,
        league: "MLB",
        city: f.city,
        team: f.team,
        w: liveStanding.wins,
        l: liveStanding.losses,
        t: liveStanding.ties,
        win_pct: liveStanding.win_pct,
        rs: liveStanding.runs_for,
        ra: liveStanding.runs_against,
        run_diff: liveStanding.run_diff,
        division: liveStanding.division || seasons[seasons.length - 1]?.division || "",
        main_div: liveStanding.league || "",
        place: liveStanding.division_rank ? `#${liveStanding.division_rank}` : "",
        playoff: false,
        div_title: false,
        best_rec_leag: false,
        lcs_app: false,
        ws_app: false,
        champ: false,
        champ_app: false,
        oth_chmp_app: false,
        oth_chmp: false,
        conf_final: false,
        is_live: true,
      }
    : null;
  // A workbook row is "empty placeholder" if it has no W, no L, no
  // postseason flags. Real seasons (including in-progress workbook updates)
  // always have at least one non-zero value here. The 2026 rows that arrive
  // pre-populated with just City/Division and W=0 L=0 are placeholders.
  const isEmptyRow = (s: Season): boolean =>
    s.w === 0 && s.l === 0 && !s.ws_app && !s.playoff && !s.champ && !s.oth_chmp_app;
  const workbookReversed = [...seasons].reverse();
  const seasonRows: Array<Season & { is_live?: true }> = liveSeasonRow
    ? [liveSeasonRow, ...workbookReversed.filter((r) => !(r.year === liveSeasonRow.year && isEmptyRow(r)))]
    : workbookReversed.filter((r) => !(r.year >= currentYear && isEmptyRow(r)));
  const seasonRangeEnd = liveSeasonRow
    ? liveSeasonRow.year
    : (seasonRows[0]?.year ?? new Date().getFullYear() - 1);

  // Resolve opponent slugs server-side for top-games rows so the renderer
  // can link to active franchise pages and fall back to plain text for
  // defunct / pre-WS opponents.
  const topGamesWithOppSlug = topGames.map((g) => {
    const opp = getFranchiseByCanonical(g.opp_canonical);
    return { ...g, opp_slug: opp?.slug ?? null };
  });

  const sportsTeamLd = sportsTeamJsonLd({
    name: f.display_name,
    sport: "Baseball",
    league: "MLB",
    metroName: f.metro,
    metroSlug: f.metro_slug ?? "",
    qid: f.wikidata_qid ?? undefined,
    wikipediaUrl: f.wikipedia_url ?? undefined,
    url: `${BASE_URL}/teams/mlb/${f.slug}`,
    foundingYear: f.founding_year ?? undefined,
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(sportsTeamLd) }}
      />
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/mlb" className="hover:text-[var(--text)]">MLB</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.display_name}</span>
      </nav>

      {/* Back-to-league chip. Sits between the breadcrumb and the hero
          so the link is impossible to miss while reading down. */}
      <div className="mb-4">
        <Link
          href="/teams/mlb"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All {franchiseCount} MLB franchises</span>
        </Link>
      </div>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${f.display_name} logo`}
            className="w-20 h-20 flex-shrink-0 object-contain" loading="lazy" decoding="async"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full grid place-items-center font-extrabold flex-shrink-0"
            style={{ background: mono.bg, color: mono.fg, fontSize: "24px" }}
            aria-hidden
          >
            {mono.mono}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.display_name}</h1>
        <ChampionBadge items={getCurrentChampionships(f.display_name, "Baseball")} />
          <ValuationChip league="mlb" slug={f.slug} className="mt-2" />
          <GhostFranchiseTag league="mlb" slug={f.slug} className="mt-2" />
          <p className="text-sm text-[var(--text-muted)] mt-1">
            <span className="text-[var(--text-dim)]">Founded:</span> <span className="text-[var(--text)]">{f.founding_year ?? "—"}</span>
            {" · "}
            <span className="text-[var(--text-dim)]">Metro Area:</span>{" "}
            {f.metro_slug ? (
              <Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{f.metro}</Link>
            ) : (
              <span className="text-[var(--text)]">{f.metro}</span>
            )}
            {f.conf ? <>{" · "}{f.conf}</> : null}
            {f.division ? <>{" · "}{f.division}</> : null}
            {" · "}
            <span className="text-[var(--text-dim)]">Home:</span>{" "}
            {f.metro_slug ? (
              <Link
                href={`/rankings/${f.metro_slug}#map`}
                className="text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                title={`Open the ${f.metro} metro map`}
              >
                {f.stadium}
              </Link>
            ) : (
              <span className="text-[var(--text)]">{f.stadium}</span>
            )}
          </p>
          {formerly && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">
              Formerly based in {formerly}.
            </p>
          )}
          {topTeamPick && topTeamFranchiseMatch && (
            <Link
              href={`/top-teams#${topTeamAnchorId(topTeamPick.metro)}`}
              className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors text-xs font-medium"
              title={`This franchise is the metro\u2019s named Top Team pick on The Team That Wins the City`}
            >
              <span className="text-amber-400 text-base leading-none" aria-hidden>&#9812;</span>
              <span className="font-semibold tracking-wide">Top Team</span>
              <span className="opacity-80">
                {topTeamPick.metro}
              </span>
            </Link>
          )}
          {(f.wikipedia_url || f.wikidata_qid) && (
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              {f.wikipedia_url && (
                <a
                  href={f.wikipedia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  title={`Open this franchise on Wikipedia`}
                >
                  <span className="font-bold tracking-wider text-[10px]">W</span>
                  <span>Wikipedia</span>
                </a>
              )}
              {f.wikidata_qid && (
                <a
                  href={`https://www.wikidata.org/wiki/${f.wikidata_qid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  title={`Open Wikidata entity ${f.wikidata_qid}`}
                >
                  <span className="font-bold tracking-wider text-[10px]">Q</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{f.wikidata_qid}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      <RivalriesSection rivals={getRivalries(f.canonical, "Baseball", "MLB")} />

      {/* Headline stat strip — 5 cells, mirrors NFL */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        <StatCell
          v={f.championships.toString()}
          k="World Series"
          sub={
            f.pre_ws_championships > 0
              ? `${f.ws_appearances} WS App · ${f.pre_ws_championships} pre-1903 cup`
              : `${f.ws_appearances} WS Appearances`
          }
        />
        <StatCell
          v={f.ws_appearances.toString()}
          k="Pennants"
          sub={f.lcs_appearances > 0 ? `${f.lcs_appearances} LCS App · ${f.division_titles} Div titles` : `${f.division_titles} Div titles`}
        />
        <StatCell
          v={f.playoff_appearances.toString()}
          k="Playoff appearances"
          sub={`Postseason ${f.playoff_w}-${f.playoff_l}`}
        />
        <StatCell v={f.win_pct.toFixed(3)} k="All-time win pct" />
        <StatCell v={f.seasons.toString()} k="Seasons" sub={`since ${f.founding_year ?? "—"}`} />
      </div>

      {/* Championships timeline */}
      <Block
        title="Championships"
        deck="Pre-1903 cup wins (Temple Cup, World's Series, NL pennants) in slate; modern World Series titles in gold."
      >
        {champs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No championships yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {champs.map((c) => {
                const colors = TITLE_COLORS[c.era];
                return (
                  <span
                    key={`${c.year}-${c.era}`}
                    className="text-xs font-semibold px-2.5 py-1 rounded"
                    style={{ background: colors.bg, color: colors.text }}
                    title={c.era === "ws" ? `${c.year} World Series` : `${c.year} pre-1903 cup`}
                  >
                    {c.year}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.pre_ws.bg }} />
                Pre-1903 cup / NL pennant
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.ws.bg }} />
                World Series (1903-present)
              </span>
            </div>
          </>
        )}
      </Block>

      {/* Pennants (formerly "Championship appearances"). In baseball, the
          pennant is the league championship — the team that advances to the
          World Series. Pre-1903 cup appearances (Temple Cup, Chronicle-
          Telegraph, World's Series) sit in the same block for franchises old
          enough to have them. */}
      <Block
        title="Pennants"
        deck="Every World Series appearance and pre-1903 cup appearance. Solid chip = won the pennant (WS / cup); outlined chip = lost the WS / cup."
      >
        {champAppearances.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No championship appearances.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {champAppearances.map((a) => {
              const colors = TITLE_COLORS[a.era];
              return (
                <span
                  key={`${a.year}-${a.era}`}
                  className="text-xs font-semibold px-2.5 py-1 rounded inline-flex items-center gap-1"
                  style={a.won
                    ? { background: colors.bg, color: colors.text }
                    : { background: "transparent", color: colors.bg, border: `1px solid ${colors.bg}` }
                  }
                  title={`${a.won ? "Won" : "Lost"} ${a.era === "ws" ? "World Series" : "pre-1903 cup"}`}
                >
                  {a.year}
                  {a.won ? <span aria-hidden style={{ fontSize: "9px" }}>●</span> : null}
                </span>
              );
            })}
          </div>
        )}
      </Block>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        {/* All-time record */}
        <Block title="All-time record" deck={null}>
          <table className="w-full text-sm" data-no-scroll-check>
            <tbody>
              <Row k="Regular-season W-L" v={`${f.all_time_w}-${f.all_time_l}`} />
              <Row k="Win pct" v={f.win_pct.toFixed(3)} />
              <Row k="Playoff record" v={`${f.playoff_w}-${f.playoff_l}`} />
              <Row k="Championship appearances" v={`${champAppearances.length} (${champs.length} wins)`} />
              <Row k="LCS appearances" v={`${f.lcs_appearances}`} />
              <Row k="Division titles" v={f.division_titles.toString()} />
              <Row k="Total seasons" v={f.seasons.toString()} />
              <Row k=".500 or better seasons" v={f.five_hundred_seasons.toString()} />
              <Row k="Most recent championship" v={f.last_championship_year ? f.last_championship_year.toString() : "—"} />
            </tbody>
          </table>
        </Block>

        {/* Stadium history */}
        <Block title="Stadium history" deck="Grouped by physical ballpark. Naming-rights eras nested.">
          {stadiums.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">No stadium history available.</p>
          ) : (
            <div className="space-y-2">
              {stadiums.map((b) => (
                <div
                  key={`${b.canonical}-${b.first_year}`}
                  className="border rounded-lg p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{b.canonical}</h3>
                    <span className="text-xs text-[var(--text-muted)]">
                      {b.first_year ?? "?"}{b.last_year && b.last_year >= 2024 ? "-present" : `-${b.last_year ?? "?"}`}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {b.city}{b.state ? `, ${abbreviateState(b.state)}` : ""}
                  </div>
                  {b.eras.length > 1 && (
                    <ul className="text-xs text-[var(--text-muted)] mt-2 pl-4 list-disc space-y-0.5">
                      {b.eras.map((e, i) => (
                        <li key={i}>
                          <span className="text-[var(--text)]">{e.era_name}</span>{" "}
                          {e.first_year ?? "?"}-{e.last_year ?? "?"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Block>
      </div>

      {/* Season-by-season — visually emphasised so it doesn't get lost when
          scrolling. Left accent border, bumped vertical padding, bigger
          summary type, and a chevron that flips on open. */}
      <details open
        className="group mt-6 border-l-4 border-y border-r rounded-xl shadow-sm"
        style={{
          background: "var(--bg-card)",
          borderTopColor: "var(--border)",
          borderRightColor: "var(--border)",
          borderBottomColor: "var(--border)",
          borderLeftColor: "var(--accent)",
        }}
      >
        <summary className="cursor-pointer px-5 sm:px-6 py-5 list-none flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-transform group-open:rotate-90"
              style={{
                background: "rgba(78,205,196,0.16)",
                color: "var(--accent)",
              }}
            >
              ›
            </span>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-semibold tracking-tight">Season-by-season</div>
              <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                {f.founding_year} to {seasonRangeEnd} · {seasonRows.length} seasons · click to expand
              </div>
            </div>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded"
            style={{
              background: "rgba(78,205,196,0.12)",
              color: "var(--accent)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span className="group-open:hidden">Show table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </span>
        </summary>
        <div className="px-5 pb-5">
          <SeasonsByTeamTable
            rows={seasonRows}
            sourceLabel={standings.source_label || undefined}
            fetchedAt={standings.fetched_at || undefined}
          />
        </div>
      </details>


      {/* Top postseason games */}
      <Block
        title="Top 12 postseason games"
        deck="Highest-rated postseason games in franchise history by the site's Game Score metric, which combines hype, quality, stakes, and matchup rank. Losses can outrank routine wins because the formula scores game quality, not franchise spin."
      >
        {topGamesWithOppSlug.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No postseason games scored.</p>
        ) : (
          <>
            {/* Mobile: one card per game instead of a 6-column table that would
                need sideways scrolling to read the matchup. Same
                `topGamesWithOppSlug` array drives both this list and the
                desktop table below. */}
            <div className="grid grid-cols-1 gap-2 sm:hidden">
              {topGamesWithOppSlug.map((g, i) => {
                const isLoss = g.result === "L";
                const isTie = g.result === "T";
                const teamSide = { city: g.team_city, team: g.team, slug: f.slug, score: g.rf };
                const oppSide = { city: g.opp_city, team: g.opp_team, slug: g.opp_slug, score: g.ra };
                const left = isLoss ? oppSide : teamSide;
                const right = isLoss ? teamSide : oppSide;
                const renderName = (side: { city: string; team: string; slug: string | null | undefined }, bold: boolean) => {
                  const label = `${side.city} ${side.team}`;
                  const cls = bold ? "font-semibold" : "text-[var(--text-muted)]";
                  if (side.slug) {
                    return (
                      <Link href={`/teams/mlb/${side.slug}`} className={`${cls} hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2`}>
                        {label}
                      </Link>
                    );
                  }
                  return <span className={cls}>{label}</span>;
                };
                return (
                  <div
                    key={`${g.year}-${g.opp_canonical}-${g.game_num ?? ""}-${i}-card`}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: "var(--border)",
                      background: isLoss ? "rgba(239,68,68,0.04)" : "var(--bg-card)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="tabular-nums">#{i + 1} · {g.date ?? g.year}</span>
                      <span className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>{g.game_score.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--text-dim)]">
                        {g.year}{g.round ? ` ${g.round}` : ""}{g.game_num ? ` G${g.game_num}` : ""}{g.extra_innings ? " · Extras" : ""}
                      </span>
                      <span
                        className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                        style={
                          g.result === "W"
                            ? { background: "rgba(78,205,196,0.18)", color: "var(--accent)" }
                            : g.result === "L"
                            ? { background: "rgba(239,68,68,0.18)", color: "#fca5a5" }
                            : { background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }
                        }
                      >
                        {isTie ? "T" : g.result}
                      </span>
                    </div>
                    <div className="mt-2 leading-tight text-sm">
                      {renderName(left, !isTie)}{" "}
                      <span className="tabular-nums font-semibold" style={{ color: isTie ? "var(--text-muted)" : "var(--accent)" }}>{left.score}</span>
                      <span className="mx-1 text-[var(--text-dim)]">{isTie ? "=" : "-"}</span>
                      <span className="tabular-nums text-[var(--text-muted)]">{right.score}</span>{" "}
                      {renderName(right, false)}
                    </div>
                    {g.stadium ? (() => {
                      const locParts = [g.stadium_city, g.stadium_state].filter(Boolean).join(", ");
                      const title = g.stadium_canonical && g.stadium_canonical !== g.stadium
                        ? `${g.stadium} (now ${g.stadium_canonical})${locParts ? " — " + locParts : ""}`
                        : `${g.stadium}${locParts ? " — " + locParts : ""}`;
                      return (
                        <div
                          className="text-[10px] mt-1 truncate font-medium tracking-wide"
                          style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                          title={title}
                        >
                          {g.stadium}
                          {locParts ? <span className="ml-1 opacity-80">· {locParts}</span> : null}
                        </div>
                      );
                    })() : null}
                  </div>
                );
              })}
            </div>

          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
                  <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
                  <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Round</th>
                  <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Result</th>
                  <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Match</th>
                  <th className="text-right font-medium py-2 uppercase tracking-wider text-[10px]">Game Score</th>
                </tr>
              </thead>
              <tbody>
                {topGamesWithOppSlug.map((g, i) => {
                  const isLoss = g.result === "L";
                  const isTie = g.result === "T";
                  const teamSide = { city: g.team_city, team: g.team, slug: f.slug, score: g.rf };
                  const oppSide = { city: g.opp_city, team: g.opp_team, slug: g.opp_slug, score: g.ra };
                  const left = isLoss ? oppSide : teamSide;
                  const right = isLoss ? teamSide : oppSide;
                  const renderName = (side: { city: string; team: string; slug: string | null | undefined }, bold: boolean) => {
                    const label = `${side.city} ${side.team}`;
                    const cls = bold ? "font-semibold" : "text-[var(--text-muted)]";
                    if (side.slug) {
                      return (
                        <Link href={`/teams/mlb/${side.slug}`} className={`${cls} hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2`}>
                          {label}
                        </Link>
                      );
                    }
                    return <span className={cls}>{label}</span>;
                  };
                  return (
                    <tr
                      key={`${g.year}-${g.opp_canonical}-${g.game_num ?? ""}-${i}`}
                      className="border-t"
                      style={{
                        borderColor: "var(--border)",
                        background: isLoss ? "rgba(239,68,68,0.04)" : undefined,
                      }}
                    >
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">
                        {g.year}{g.round ? ` ${g.round}` : ""}{g.game_num ? ` G${g.game_num}` : ""}{g.extra_innings ? " · Extras" : ""}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={
                            g.result === "W"
                              ? { background: "rgba(78,205,196,0.18)", color: "var(--accent)" }
                              : g.result === "L"
                              ? { background: "rgba(239,68,68,0.18)", color: "#fca5a5" }
                              : { background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }
                          }
                        >
                          {isTie ? "T" : g.result}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="leading-tight">
                          {renderName(left, !isTie)}{" "}
                          <span className="tabular-nums font-semibold" style={{ color: isTie ? "var(--text-muted)" : "var(--accent)" }}>{left.score}</span>
                          <span className="mx-1 text-[var(--text-dim)]">{isTie ? "=" : "-"}</span>
                          <span className="tabular-nums text-[var(--text-muted)]">{right.score}</span>{" "}
                          {renderName(right, false)}
                        </div>
                        {g.stadium ? (() => {
                          const locParts = [g.stadium_city, g.stadium_state].filter(Boolean).join(", ");
                          const title = g.stadium_canonical && g.stadium_canonical !== g.stadium
                            ? `${g.stadium} (now ${g.stadium_canonical})${locParts ? " — " + locParts : ""}`
                            : `${g.stadium}${locParts ? " — " + locParts : ""}`;
                          return (
                            <div
                              className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                              style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                              title={title}
                            >
                              {g.stadium}
                              {locParts ? <span className="ml-1 opacity-80">· {locParts}</span> : null}
                            </div>
                          );
                        })() : null}
                      </td>
                      <td className="py-2 text-right font-semibold">{g.game_score.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Block>

      {/* Award winners */}
      <Block
        title="Award winners"
        deck={`League-wide awards held by ${f.name} players or managers. Curated to the headline tier: MVP, Cy Young, Rookie of the Year, Manager of the Year, postseason MVPs, Hank Aaron, Roberto Clemente, and the rare Triple Crown.`}
      >
        {Object.keys(awards).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No awards in this dataset.</p>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-6 [column-fill:balance]">
            {AWARD_ORDER.map((awardKey) => {
              const winners = awards[awardKey];
              if (!winners || winners.length === 0) return null;
              return (
                <div key={awardKey} className="break-inside-avoid mb-4">
                  <h3 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-1">
                    {awardKey} <span className="text-[var(--text-dim)]">· {winners.length}</span>
                  </h3>
                  <ul className="text-sm space-y-0.5">
                    {winners.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[var(--text-muted)] tabular-nums w-12 flex-shrink-0">{w.year}</span>
                        <span>{w.player}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Block>


    </main>
  );
}

// ---------- Defunct franchise page ----------

// Renders a defunct franchise from historical.json. Reuses the active
// page's styling primitives (container, breadcrumb, back chip, Block,
// StatCell, Row) and the shared SeasonsByTeamTable. Sections without a
// data source for defunct teams (stadium, awards, live standings, top
// games, metro map) are omitted.
function DefunctFranchisePage({ h, slug }: { h: HistoricalFranchise; slug: string }) {
  const name = defunctDisplayName(h);
  const years = defunctYears(h);
  const seasons = getHistoricalSeasonsForSlug(slug);
  // historical-seasons rows are oldest-first in the source; SeasonsByTeamTable
  // is fully sortable and defaults to newest-first, so pass through as-is.
  const seasonRows: Season[] = seasons;
  const champYears = seasons.filter((s) => s.champ).map((s) => s.year);
  const mono = monogramFor(slug);
  const franchiseCount = getAllFranchiseSlugs().length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/mlb" className="hover:text-[var(--text)]">MLB</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/mlb/historical" className="hover:text-[var(--text)]">Defunct</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{name}</span>
      </nav>

      {/* Back chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/teams/mlb/historical"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All defunct MLB franchises</span>
        </Link>
        <Link
          href="/teams/mlb"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span>All {franchiseCount} active MLB franchises</span>
        </Link>
      </div>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div
          className="w-20 h-20 rounded-full grid place-items-center font-extrabold flex-shrink-0"
          style={{ background: mono.bg, color: mono.fg, fontSize: "24px" }}
          aria-hidden
        >
          {mono.mono}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{name}</h1>
            <span
              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded"
              style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}
            >
              Defunct
            </span>
          </div>
          <GhostFranchiseTag league="mlb" slug={slug} className="mt-2" />
          <p className="text-sm text-[var(--text-muted)] mt-2">
            <span className="text-[var(--text-dim)]">Years active:</span>{" "}
            <span className="text-[var(--text)]">{years}</span>
            {" · "}
            <span className="text-[var(--text-dim)]">City:</span>{" "}
            <span className="text-[var(--text)]">{h.city}</span>
            {h.league ? (
              <>
                {" · "}
                <span className="text-[var(--text-dim)]">League:</span>{" "}
                <span className="text-[var(--text)]">{h.league}</span>
              </>
            ) : null}
          </p>
          {h.team_historical ? (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">
              Listed in the all-time record as {h.team_historical}.
            </p>
          ) : null}
        </div>
      </header>

      {/* Headline stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
        <StatCell v={h.championships.toString()} k="World Series" />
        <StatCell v={`${h.w}-${h.l}${h.t ? `-${h.t}` : ""}`} k="All-time record" />
        <StatCell v={h.win_pct.toFixed(3)} k="All-time win pct" />
        <StatCell v={h.seasons.toString()} k="Seasons" sub={years} />
      </div>

      {/* Championships */}
      {champYears.length > 0 ? (
        <Block
          title="Championships"
          deck="Pre-1903 cup / NL pennant wins in slate; modern World Series titles in gold."
        >
          <div className="flex flex-wrap gap-2">
            {champYears.map((y) => {
              const colors = y >= 1903 ? TITLE_COLORS.ws : TITLE_COLORS.pre_ws;
              return (
                <span
                  key={y}
                  className="text-xs font-semibold px-2.5 py-1 rounded"
                  style={{ background: colors.bg, color: colors.text }}
                  title={y >= 1903 ? `${y} World Series` : `${y} pre-1903 cup / NL pennant`}
                >
                  {y}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.pre_ws.bg }} />
              Pre-1903 cup / NL pennant
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.ws.bg }} />
              World Series (1903-present)
            </span>
          </div>
        </Block>
      ) : null}

      {/* All-time record */}
      <Block title="All-time record" deck={null}>
        <table className="w-full text-sm" data-no-scroll-check>
          <tbody>
            <Row k="Regular-season W-L" v={`${h.w}-${h.l}${h.t ? `-${h.t}` : ""}`} />
            <Row k="Win pct" v={h.win_pct.toFixed(3)} />
            <Row k="World Series titles" v={h.championships.toString()} />
            <Row k="Total seasons" v={h.seasons.toString()} />
            <Row k="Years active" v={years} />
            <Row k="League(s)" v={h.league || "—"} />
          </tbody>
        </table>
      </Block>

      {/* Season-by-season */}
      {seasonRows.length > 0 ? (
        <details open
          className="group mt-6 border-l-4 border-y border-r rounded-xl shadow-sm"
          style={{
            background: "var(--bg-card)",
            borderTopColor: "var(--border)",
            borderRightColor: "var(--border)",
            borderBottomColor: "var(--border)",
            borderLeftColor: "var(--accent)",
          }}
        >
          <summary className="cursor-pointer px-5 sm:px-6 py-5 list-none flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-transform group-open:rotate-90"
                style={{ background: "rgba(78,205,196,0.16)", color: "var(--accent)" }}
              >
                &rsaquo;
              </span>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-semibold tracking-tight">Season-by-season</div>
                <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                  {years} &middot; {seasonRows.length} seasons &middot; click to expand
                </div>
              </div>
            </div>
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded"
              style={{
                background: "rgba(78,205,196,0.12)",
                color: "var(--accent)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <span className="group-open:hidden">Show table</span>
              <span className="hidden group-open:inline">Hide table</span>
            </span>
          </summary>
          <div className="px-5 pb-5">
            <SeasonsByTeamTable rows={seasonRows} />
          </div>
        </details>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
        Defunct-franchise totals from the MLB workbook (historical Year by Year + Totals).
      </p>
    </main>
  );
}

// ---------- Small helpers ----------

function StatCell({ v, k, sub }: { v: string; k: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold tracking-tight">{v}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1">{k}</div>
      {sub && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );
}

function Block({ title, deck, children }: { title: string; deck: string | null; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-5 mt-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {deck && <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">{deck}</p>}
      {!deck && <div className="mt-2" />}
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
      <td className="py-1.5 text-[var(--text-muted)]">{k}</td>
      <td className="py-1.5 text-right tabular-nums">{v}</td>
    </tr>
  );
}
