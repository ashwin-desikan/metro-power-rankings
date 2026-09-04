import type { Metadata } from "next";
import { DataBar } from "@/app/_shared/DataBar";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import ValuationChip from "@/app/teams/ValuationChip";
import GhostFranchiseTag from "@/app/teams/GhostFranchiseTag";
import HeartbreakTag from "@/app/teams/HeartbreakTag";
import HeartbreakPanel from "@/app/teams/HeartbreakPanel";
import { notFound } from "next/navigation";
import {
  getAllFranchiseSlugs,
  getFranchiseBySlug,
  getFranchiseByCanonical,
  getChampionships,
  getChampionshipAppearances,
  getStadiumHistory,
  getAwards,
  getAllNbaSelections,
  getSeasons,
  getTopGamesForTeam,
  getPlayoffState,
  getPlayoffStateForCanonical,
  getHistoricalSlugs,
  getHistoricalBySlug,
  getHistoricalSeasons,
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
  PLAYOFF_STATE_COLORS,
  abbreviateState,
  brefYearUrl,
  seasonLabel,
  nbaRoundLabel,
  type Season,
  type HistoricalFranchise,
} from "@/lib/nba";
import { BASE_URL, SITE_NAME, serializeJsonLd, sportsTeamJsonLd } from "@/lib/seo";
import { findTopTeamForName, topTeamAnchorId } from "@/lib/topTeams";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const active = getAllFranchiseSlugs();
  const activeSet = new Set(active);
  // Union active + defunct slugs. Guard against a defunct slug colliding with
  // an active one (active wins; defunct rendering is unreachable for it).
  const defunct = getHistoricalSlugs().filter((s) => !activeSet.has(s));
  return [...active, ...defunct].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (f) {
    const url = `${BASE_URL}/teams/nba/${f.slug}`;
    const desc =
      `${f.display_name}: ${f.championships} championships, all-time record ${f.all_time_w}-${f.all_time_l} (${f.win_pct.toFixed(3)}), founded ${f.founding_year}. Plays in ${f.arena}, ${f.metro}.`;
    return {
      title: f.display_name,
      description: desc,
      alternates: { canonical: `/teams/nba/${f.slug}` },
      openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${f.display_name} | ${SITE_NAME}`, description: desc, url, type: "website" },
      twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${f.display_name} | ${SITE_NAME}`, description: desc },
    };
  }
  const h = getHistoricalBySlug(slug);
  if (!h) return { title: "Franchise not found" };
  const yearsLabel =
    h.first_year && h.last_year
      ? h.first_year === h.last_year
        ? `${h.first_year}`
        : `${h.first_year}–${h.last_year}`
      : "";
  const url = `${BASE_URL}/teams/nba/${h.slug}`;
  const desc =
    `${h.display_name} (defunct${yearsLabel ? `, ${yearsLabel}` : ""}): ${h.championships} championships, all-time record ${h.all_time_w}-${h.all_time_l} (${h.win_pct.toFixed(3)}) across ${h.seasons} season${h.seasons === 1 ? "" : "s"} in the ${h.league_history}.`;
  return {
    title: `${h.display_name} (defunct)`,
    description: desc,
    alternates: { canonical: `/teams/nba/${h.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${h.display_name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${h.display_name} | ${SITE_NAME}`, description: desc },
  };
}

const AWARD_ORDER: string[] = ["MVP", "DPOY", "ROY", "COY", "MIP", "6MOY", "CPOY"];

const AWARD_LABEL_LONG: Record<string, string> = {
  MVP: "Most Valuable Player",
  DPOY: "Defensive Player of the Year",
  ROY: "Rookie of the Year",
  COY: "Coach of the Year",
  MIP: "Most Improved Player",
  "6MOY": "Sixth Man of the Year",
  CPOY: "Clutch Player of the Year",
};

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
    if (!h) notFound();
    return <DefunctFranchisePage h={h} />;
  }

  const champs = getChampionships(f.canonical);
  const champAppearances = getChampionshipAppearances(f.canonical);
  const stadiums = getStadiumHistory(f.canonical);
  const awards = getAwards(f.canonical);
  const allNba = getAllNbaSelections(f.canonical);
  const seasons = getSeasons(f.slug);
  const topGames = getTopGamesForTeam(f.slug);
  // Top-games board is explicitly "ranked by Game Score"; max is this
  // column's own maximum over the full topGames set, computed once.
  const topGamesMax = Math.max(...topGames.map((g) => g.game_score ?? 0), 0.001);
  const playoffState = getPlayoffStateForCanonical(f.canonical);
  const playoffBundle = getPlayoffState();
  const showPostseasonChip = playoffState && !playoffBundle.is_postseason_complete;
  const mono = monogramFor(f.slug);
  const logo = logoUrlFor(f.slug);
  const formerly = priorCitySummary(f);

  const topTeamPick = findTopTeamForName(
    [f.display_name, `${f.city} ${f.team}`, f.name, f.team],
    f.metro,
  );
  const franchiseCount = getAllFranchiseSlugs().length;

  // CF appearances derived from season rows (workbook col V "CF App").
  const cfSeasons = seasons.filter((s) => s.cf_app);

  // Reverse-chronological season-by-season for display
  const workbookReversed = [...seasons].reverse();

  // Annotate the most-recent in-progress playoff season's row with playoff state badge
  const psYear = playoffState?.year ?? null;
  const seasonRows: Array<Season & { is_live?: true; playoff_state_label?: string; playoff_state_bg?: string; playoff_state_text?: string }> =
    workbookReversed.map((s) => {
      if (psYear && s.year === psYear && playoffState) {
        const style = PLAYOFF_STATE_COLORS[playoffState.state];
        return {
          ...s,
          playoff_state_label: style?.label,
          playoff_state_bg: style?.bg,
          playoff_state_text: style?.text,
        };
      }
      return s;
    });

  // All-NBA selections grouped by year for the block display
  const allNbaByYear = new Map<number, { tier: "1st" | "2nd" | "3rd"; player: string }[]>();
  for (const sel of allNba) {
    if (!allNbaByYear.has(sel.year)) allNbaByYear.set(sel.year, []);
    allNbaByYear.get(sel.year)!.push({ tier: sel.tier, player: sel.player });
  }
  const allNbaYears = Array.from(allNbaByYear.keys()).sort((a, b) => b - a);

  const sportsTeamLd = sportsTeamJsonLd({
    name: f.display_name,
    sport: "Basketball",
    league: "NBA",
    metroName: f.metro,
    metroSlug: f.metro_slug ?? "",
    qid: f.wikidata_qid ?? undefined,
    wikipediaUrl: f.wikipedia_url ?? undefined,
    url: `${BASE_URL}/teams/nba/${f.slug}`,
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
        <Link href="/teams/nba" className="hover:text-[var(--text)]">NBA</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.display_name}</span>
      </nav>

      {/* Back-to-league chip */}
      <div className="mb-4">
        <Link
          href="/teams/nba"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All {franchiseCount} NBA franchises</span>
        </Link>
      </div>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
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
        <ChampionBadge items={getCurrentChampionships(f.display_name, "Basketball")} />
          <ValuationChip league="nba" slug={f.slug} className="mt-2" />
          <GhostFranchiseTag league="nba" slug={f.slug} className="mt-2" />
          <HeartbreakTag league="nba" slug={f.slug} className="mt-2" />
          <p className="text-sm text-[var(--text-muted)] mt-1">
            <span className="text-[var(--text-dim)]">Founded:</span>{" "}
            <span className="text-[var(--text)]">{f.founding_year ?? "—"}</span>
            {f.metro && (
              <>
                {" · "}
                <span className="text-[var(--text-dim)]">Metro Area:</span>{" "}
                {f.metro_slug ? (
                  <Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{f.metro}</Link>
                ) : (
                  <span className="text-[var(--text)]">{f.metro}</span>
                )}
              </>
            )}
            {f.conf ? <>{" · "}{f.conf}</> : null}
            {f.division ? <>{" · "}{f.division}</> : null}
            {f.arena && (
              <>
                {" · "}
                <span className="text-[var(--text-dim)]">Arena:</span>{" "}
                {f.metro_slug ? (
                  <Link
                    href={`/rankings/${f.metro_slug}#map`}
                    className="text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                    title={`Open the ${f.metro} metro map`}
                  >
                    {f.arena}
                  </Link>
                ) : (
                  <span className="text-[var(--text)]">{f.arena}</span>
                )}
              </>
            )}
          </p>
          {formerly && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">
              Formerly based in {formerly}.
            </p>
          )}
          {/* All-Star count line */}
          {f.all_star_count > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              <span className="text-[var(--text-dim)]">All-Star selections:</span>{" "}
              <span className="text-[var(--text)] font-semibold">{f.all_star_count}</span>
              <span className="text-[var(--text-dim)] ml-1">player-seasons across history</span>
            </p>
          )}
          {/* Playoff state badge in hero — drops after Finals end. Links
              out to the current year's Wikipedia playoffs page. */}
          {showPostseasonChip && playoffState && (
            <div className="mt-3">
              <a
                href={`https://en.wikipedia.org/wiki/${playoffState.year}_NBA_playoffs`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide hover:opacity-85 transition-opacity"
                style={{
                  background: PLAYOFF_STATE_COLORS[playoffState.state].bg,
                  color: PLAYOFF_STATE_COLORS[playoffState.state].text,
                }}
                title={`${playoffState.year} NBA playoffs: ${playoffState.last_round} (Wikipedia)`}
              >
                <span aria-hidden>●</span>
                <span>{playoffState.year} · {PLAYOFF_STATE_COLORS[playoffState.state].label}</span>
              </a>
            </div>
          )}
          {/* Top Team badge */}
          {topTeamPick && (
            <Link
              href={`/top-teams#${topTeamAnchorId(topTeamPick.metro)}`}
              className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors text-xs font-medium ml-2"
              title="Metro's named Top Team pick"
            >
              <span className="text-amber-400 text-base leading-none" aria-hidden>&#9812;</span>
              <span className="font-semibold tracking-wide">Top Team</span>
              <span className="opacity-80">{topTeamPick.metro}</span>
            </Link>
          )}
          {/* Wikipedia / Wikidata */}
          {(f.wikipedia_url || f.wikidata_qid) && (
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              {f.wikipedia_url && (
                <a
                  href={f.wikipedia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  title="Open on Wikipedia"
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

      <RivalriesSection rivals={getRivalries(f.canonical, "Basketball", "NBA")} />

      <HeartbreakPanel league="nba" slug={f.slug} className="mb-8" />

      {/* Headline stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        <StatCell
          v={f.championships.toString()}
          k="Championships"
          sub={`${f.championship_appearances} Finals Appearances`}
        />
        <StatCell
          v={f.championship_appearances.toString()}
          k="Finals Appearances"
          sub={`${f.cf_appearances} Conf. Finals`}
        />
        <StatCell
          v={f.playoff_appearances.toString()}
          k="Playoff Appearances"
          sub={`Postseason ${f.playoff_w}-${f.playoff_l}`}
        />
        <StatCell v={f.win_pct.toFixed(3)} k="All-time Win%" />
        <StatCell v={f.seasons.toString()} k="Seasons" sub={`since ${f.founding_year ?? "—"}`} />
      </div>

      {/* Championships timeline */}
      <Block
        title="Championships"
        deck="ABA cups in slate (1968-76, rival league merged into NBA in 1976), BAA + NBA titles in gold."
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
                    title={`${c.year} ${c.era.toUpperCase()} Champion`}
                  >
                    {seasonLabel(c.year)}
                    <span className="ml-1 opacity-70 text-[10px]">{c.era === "aba" ? "ABA" : ""}</span>
                  </span>
                );
              })}
            </div>
          </>
        )}
      </Block>

      {/* Finals appearances */}
      <Block
        title="Finals Appearances"
        deck="Solid chip = won the championship; outlined chip = lost the Finals."
      >
        {champAppearances.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No Finals appearances.</p>
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
                  title={`${a.won ? "Won" : "Lost"} ${a.era.toUpperCase()} Finals ${a.year}`}
                >
                  {seasonLabel(a.year)}
                  {a.won ? <span aria-hidden style={{ fontSize: "9px" }}>●</span> : null}
                </span>
              );
            })}
          </div>
        )}
      </Block>

      {/* Conference Finals appearances */}
      {f.cf_appearances > 0 && (
        <Block
          title="Conference Finals"
          deck="Every season the franchise reached the conference finals (1971+ in NBA, applicable years in ABA)."
        >
          <div className="flex flex-wrap gap-2">
            {cfSeasons.map((s) => (
              <span
                key={s.year}
                className="text-xs font-medium px-2.5 py-1 rounded border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                title={`${seasonLabel(s.year)} Conference Finals${s.champ_app ? " (advanced to Finals)" : ""}`}
              >
                {seasonLabel(s.year)}
                {s.champ_app ? <span className="ml-1 opacity-70" style={{ fontSize: "9px" }}>↑</span> : null}
              </span>
            ))}
          </div>
        </Block>
      )}

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        {/* All-time record */}
        <Block title="All-time record" deck={null}>
          <table className="w-full text-sm" data-no-scroll-check>
            <tbody>
              <Row k="Regular-season W-L" v={`${f.all_time_w}-${f.all_time_l}`} />
              <Row k="Win pct" v={f.win_pct.toFixed(3)} />
              <Row k="Playoff record" v={`${f.playoff_w}-${f.playoff_l}`} />
              <Row k="Championships" v={`${f.championships}`} />
              <Row k="Finals appearances" v={`${f.championship_appearances}`} />
              <Row k="Conference Finals appearances" v={`${f.cf_appearances}`} />
              <Row k="Division titles" v={f.division_titles.toString()} />
              <Row k="Total seasons" v={f.seasons.toString()} />
              <Row k=".500 or better seasons" v={f.five_hundred_seasons.toString()} />
              <Row k="Most recent championship" v={f.last_championship_year ? seasonLabel(f.last_championship_year) : "—"} />
              <Row k="All-Star selections" v={f.all_star_count.toString()} />
            </tbody>
          </table>
        </Block>

        {/* Arena history */}
        <Block title="Arena history" deck="Reverse-chronological. Naming-rights eras nested under each canonical building.">
          {stadiums.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">No arena history available.</p>
          ) : (
            <div className="space-y-2">
              {stadiums.map((b) => (
                <div
                  key={`${b.canonical}-${b.first_year}`}
                  className="border rounded-lg p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  {/* Render each AS-OF era as the primary line, with the
                      canonical (current) building name as a "now: X" subtitle
                      only when the canonical differs from the as-of name. */}
                  {b.eras.map((e, i) => {
                    const sameAsCanonical = e.era_name === b.canonical;
                    const yearLabel = `${e.first_year ?? "?"}${e.last_year && e.last_year >= 2025 ? "-present" : `-${e.last_year ?? "?"}`}`;
                    const metroSlug = b.metro ? b.metro.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
                    return (
                      <div key={i} className={i > 0 ? "mt-2 pt-2 border-t" : ""} style={{ borderColor: i > 0 ? "var(--border)" : undefined }}>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {metroSlug ? (
                            <Link
                              href={`/rankings/${metroSlug}#map`}
                              className="font-semibold text-sm text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                              title={`Open the ${b.metro} metro map`}
                            >
                              {e.era_name}
                            </Link>
                          ) : (
                            <h3 className="font-semibold text-sm">{e.era_name}</h3>
                          )}
                          <span className="text-xs text-[var(--text-muted)]">{yearLabel}</span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {b.city}{b.state ? `, ${abbreviateState(b.state)}` : ""}
                          {!sameAsCanonical && (
                            <span className="ml-2 italic opacity-80">now: {b.canonical}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Block>
      </div>

      {/* Season-by-season — collapsed by default to mirror MLB/NFL */}
      <details open
        className="group mt-4 border-l-4 border-y border-r rounded-xl shadow-sm"
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
              ›
            </span>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-semibold tracking-tight">Season-by-season</div>
              <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                {f.founding_year} to {seasonRows[0]?.year ?? "—"} · {seasonRows.length} seasons · click to expand
              </div>
            </div>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            <span className="group-open:hidden">Show table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </span>
        </summary>
        <div className="px-5 pb-5">
        {/* Mobile: one card per season instead of an 11-column table forcing
            horizontal scroll at phone widths. Same `seasonRows` data as the
            desktop table below. */}
        <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
          <CappedList
            initial={12}
            noun="rows"
            bodyClassName="divide-y"
            items={seasonRows.map((s) => (
            <div key={s.year} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={brefYearUrl(s.year, s.league)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                  title={`${s.league} ${seasonLabel(s.year)} season on Basketball-Reference`}
                >
                  {seasonLabel(s.year)}
                </a>
                <SeasonPostseasonBadge s={s} />
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                <span className="text-[var(--text)]">{s.city}</span> {s.team}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <SeasonStatChip label="Conf" value={s.main_div || "—"} />
                <SeasonStatChip label="Division" value={s.division || "—"} />
                <SeasonStatChip label="W-L" value={`${s.w || 0}-${s.l || 0}`} />
                <SeasonStatChip label="Win%" value={s.win_pct ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"} />
                <SeasonStatChip label="PF/G" value={s.pf_g ? s.pf_g.toFixed(1) : "—"} />
                <SeasonStatChip label="PA/G" value={s.pa_g ? s.pa_g.toFixed(1) : "—"} />
                <SeasonStatChip label="Place" value={s.place || "—"} />
              </div>
            </div>
          ))}
          />
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs tabular-nums">
            <thead className="text-[var(--text-muted)]">
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Season</th>
                <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Team</th>
                <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Conf</th>
                <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Division</th>
                <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">W</th>
                <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">L</th>
                <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Win%</th>
                <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">PF/G</th>
                <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">PA/G</th>
                <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Place</th>
                <th className="text-left py-2 font-medium uppercase tracking-wider text-[10px]">Postseason</th>
              </tr>
            </thead>
            <tbody>
              {seasonRows.map((s) => (
                <tr key={s.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3">
                    <a
                      href={brefYearUrl(s.year, s.league)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                      title={`${s.league} ${seasonLabel(s.year)} season on Basketball-Reference`}
                    >
                      {seasonLabel(s.year)}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="text-[var(--text)]">{s.city}</span>{" "}
                    <span className="text-[var(--text-muted)]">{s.team}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.main_div || "—"}</td>
                  <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.division || "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{s.w || ""}</td>
                  <td className="py-1.5 pr-3 text-right">{s.l || ""}</td>
                  <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                    {s.win_pct ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{s.pf_g ? s.pf_g.toFixed(1) : ""}</td>
                  <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{s.pa_g ? s.pa_g.toFixed(1) : ""}</td>
                  <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.place || "—"}</td>
                  <td className="py-1.5">
                    <SeasonPostseasonBadge s={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </details>

      {/* Awards block */}
      <Block
        title="Award winners"
        deck="Headline player and coach honors held by franchise members. MVP, Defensive Player of the Year, Rookie of the Year, Coach of the Year, Most Improved Player, Sixth Man of the Year, and Clutch Player of the Year."
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
                    <span className="block text-[9px] font-normal normal-case tracking-normal text-[var(--text-dim)] mt-0.5">
                      {AWARD_LABEL_LONG[awardKey]}
                    </span>
                  </h3>
                  <ul className="text-xs space-y-0">
                    {winners.map((w, i) => (
                      <li key={i} className="flex gap-2 leading-tight py-0.5">
                        <span className="text-[var(--text-muted)] tabular-nums w-14 flex-shrink-0 text-[10px]">{seasonLabel(w.year)}</span>
                        <span className="truncate">{w.player}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Block>

      {/* All-NBA Selections */}
      <Block
        title="All-NBA Selections"
        deck="Every All-NBA 1st, 2nd, or 3rd team selection by a player wearing this franchise's jersey."
      >
        {allNbaYears.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No All-NBA selections recorded.</p>
        ) : (
          // Dense horizontal layout: one row per season, picks flow right as
          // tier-colored chips. Two-column on lg+ so high-volume franchises
          // (Lakers, Celtics) don't run forever. Breathing room comes from
          // space-y on rows and gap-x between chips rather than card padding.
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-1.5">
            {allNbaYears.map((year) => {
              const picks = allNbaByYear.get(year)!;
              const ordered = [...picks].sort((a, b) => {
                const order: Record<string, number> = { "1st": 0, "2nd": 1, "3rd": 2 };
                return (order[a.tier] ?? 9) - (order[b.tier] ?? 9);
              });
              return (
                <div key={year} className="flex items-baseline gap-3 text-xs leading-snug">
                  <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)] w-14 flex-shrink-0">
                    {seasonLabel(year)}
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 min-w-0">
                    {ordered.map((p, i) => {
                      const tierClass =
                        p.tier === "1st" ? "text-amber-300" :
                        p.tier === "2nd" ? "text-slate-300" :
                                           "text-stone-400";
                      return (
                        <span key={i} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                          <span className={`font-bold tabular-nums ${tierClass}`}>{p.tier}</span>
                          <span className="text-[var(--text)]">{p.player}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Block>

      {/* Top games by Game Score */}
      <Block
        title="Top games"
        deck={`The franchise's top ${topGames.length > 0 ? Math.min(topGames.length, 10) : 10} games ranked by Game Score: a composite of stakes, quality, and ELO-weighted matchup strength.`}
      >
        {topGames.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No playoff games recorded.</p>
        ) : (
          <>
            {/* Mobile: one card per game instead of a 7-column table forcing
                horizontal scroll at phone widths. Same `topGames` data as the
                desktop table below. */}
            <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
              <CappedList
                initial={12}
                noun="top games"
                bodyClassName="divide-y"
                items={topGames.map((g, i) => {
                const opp = getFranchiseByCanonical(g.opp_canonical);
                const oppSlug = opp?.slug;
                const oppLabel = `${g.opp_city || ""} ${g.opp_team || ""}`.trim() || g.opp_canonical;
                return (
                  <div key={i} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{seasonLabel(g.year)}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {nbaRoundLabel(g.round_num, g.round)}{g.game_num ? ` G${g.game_num}` : ""}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Game Score</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {g.game_score != null ? g.game_score.toFixed(3) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 text-sm">
                      <span className="font-semibold">{g.result || ""}</span>
                      <span className="ml-2 tabular-nums text-[var(--text-muted)]">{g.team_pts}-{g.opp_pts}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      vs{" "}
                      {oppSlug ? (
                        <Link href={`/teams/nba/${oppSlug}`} className="hover:text-[var(--accent)] hover:underline">
                          {oppLabel}
                        </Link>
                      ) : (
                        <span>{oppLabel}</span>
                      )}
                      {g.ot && <span className="ml-1 text-amber-400 text-[10px] font-bold">{g.ot_count && g.ot_count > 1 ? `${g.ot_count}OT` : "OT"}</span>}
                    </div>
                    <div className="text-[11px] text-[var(--text-dim)] mt-1">
                      {g.date || "—"} · {g.arena_as_of || g.arena_canonical}
                      {g.arena_metro ? ` · ${g.arena_metro}${g.arena_state ? `, ${g.arena_state}` : ""}` : ""}
                    </div>
                  </div>
                );
              })}
              />
            </div>

            <div className="hidden sm:block overflow-x-auto -mx-5">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-2 pl-5 pr-3 font-medium uppercase tracking-wider text-[10px]">Season</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Date</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Round</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Result</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Score</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Arena</th>
                    <th className="text-right py-2 pr-5 font-medium uppercase tracking-wider text-[10px]">
                      Game Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topGames.map((g, i) => {
                    const opp = getFranchiseByCanonical(g.opp_canonical);
                    const oppSlug = opp?.slug;
                    const oppLabel = `${g.opp_city || ""} ${g.opp_team || ""}`.trim() || g.opp_canonical;
                    return (
                      <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pl-5 pr-3">{seasonLabel(g.year)}</td>
                        <td className="py-2 pr-3 text-[var(--text-muted)]">{g.date || "—"}</td>
                        <td className="py-2 pr-3 text-[var(--text-muted)]">{nbaRoundLabel(g.round_num, g.round)}{g.game_num ? ` G${g.game_num}` : ""}</td>
                        <td className="py-2 pr-3 font-semibold">{g.result || ""}</td>
                        <td className="py-2 pr-3 text-[var(--text-muted)]">
                          <span className="font-medium text-[var(--text)]">{g.team_pts}-{g.opp_pts}</span>
                          <span className="ml-2">vs </span>
                          {oppSlug ? (
                            <Link href={`/teams/nba/${oppSlug}`} className="hover:text-[var(--accent)] hover:underline">
                              {oppLabel}
                            </Link>
                          ) : (
                            <span>{oppLabel}</span>
                          )}
                          {g.ot && <span className="ml-1 text-amber-400 text-[10px] font-bold">{g.ot_count && g.ot_count > 1 ? `${g.ot_count}OT` : "OT"}</span>}
                        </td>
                        <td className="py-2 pr-3 text-[var(--text-dim)] text-[10px]">
                          {g.arena_as_of || g.arena_canonical}
                          {g.arena_metro ? ` · ${g.arena_metro}${g.arena_state ? `, ${g.arena_state}` : ""}` : ""}
                        </td>
                        <td className="py-2 pr-5 text-right font-semibold">
                          <DataBar v={g.game_score} max={topGamesMax} dp={3} color="var(--seq-4)" width={96} label="game score" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Block>
    </main>
  );
}

// ---------- Defunct franchise page ----------

function DefunctFranchisePage({ h }: { h: HistoricalFranchise }) {
  const seasonsMap = getHistoricalSeasons();
  const rawSeasons: Season[] = seasonsMap[h.slug] ?? [];
  const seasonRows = [...rawSeasons].reverse();

  const yearsLabel =
    h.first_year && h.last_year
      ? h.first_year === h.last_year
        ? `${h.first_year}`
        : `${h.first_year}–${h.last_year}`
      : h.first_year
        ? `${h.first_year}`
        : "—";

  // Title championships from the season rows we have (era-aware chips).
  const champSeasons = rawSeasons.filter((s) => s.champ);
  const finalsSeasons = rawSeasons.filter((s) => s.champ_app);
  const cfSeasons = rawSeasons.filter((s) => s.cf_app);

  const lastCity = (h.city_history || "").split("/").pop()?.trim() || null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nba" className="hover:text-[var(--text)]">NBA</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nba/historical" className="hover:text-[var(--text)]">Defunct</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{h.display_name}</span>
      </nav>

      {/* Back chip */}
      <div className="mb-4">
        <Link
          href="/teams/nba/historical"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All defunct NBA franchises</span>
        </Link>
      </div>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div
          className="w-20 h-20 rounded-full grid place-items-center font-extrabold flex-shrink-0"
          style={{ background: "#222", color: "#fff", fontSize: "22px" }}
          aria-hidden
        >
          NBA
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{h.display_name}</h1>
            <span
              className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
              style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}
            >
              Defunct
            </span>
            {h.aba_only && (
              <span
                className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
                style={{ background: TITLE_COLORS.aba.bg, color: TITLE_COLORS.aba.text }}
                title="ABA-only franchise (rival league, 1968-76)"
              >
                ABA
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            <span className="text-[var(--text-dim)]">Years active:</span>{" "}
            <span className="text-[var(--text)]">{yearsLabel}</span>
            {lastCity && (
              <>
                {" · "}
                <span className="text-[var(--text-dim)]">Last city:</span>{" "}
                <span className="text-[var(--text)]">{lastCity}</span>
              </>
            )}
            {h.league_history && (
              <>
                {" · "}
                <span className="text-[var(--text-dim)]">Leagues:</span>{" "}
                <span className="text-[var(--text)]">{h.league_history}</span>
              </>
            )}
          </p>
          {h.team_history && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">{h.team_history}</p>
          )}
        </div>
      </header>

      {/* Headline stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        <StatCell
          v={h.championships.toString()}
          k="Championships"
          sub={`${h.championship_appearances} Finals Appearances`}
        />
        <StatCell
          v={h.championship_appearances.toString()}
          k="Finals Appearances"
          sub={`${h.cf_appearances} Conf. Finals`}
        />
        <StatCell v={h.playoff_appearances.toString()} k="Playoff Appearances" />
        <StatCell v={h.win_pct.toFixed(3)} k="All-time Win%" sub={`${h.all_time_w}-${h.all_time_l}`} />
        <StatCell v={h.seasons.toString()} k="Seasons" sub={yearsLabel} />
      </div>

      {/* Championships */}
      {champSeasons.length > 0 && (
        <Block
          title="Championships"
          deck="ABA cups in slate (1968-76, rival league merged into NBA in 1976), BAA + NBA titles in gold."
        >
          <div className="flex flex-wrap gap-2">
            {champSeasons.map((s) => {
              const era = s.league === "ABA" ? "aba" : "nba";
              const colors = TITLE_COLORS[era];
              return (
                <span
                  key={s.year}
                  className="text-xs font-semibold px-2.5 py-1 rounded"
                  style={{ background: colors.bg, color: colors.text }}
                  title={`${s.year} ${s.league} Champion`}
                >
                  {seasonLabel(s.year)}
                  <span className="ml-1 opacity-70 text-[10px]">{s.league === "ABA" ? "ABA" : ""}</span>
                </span>
              );
            })}
          </div>
        </Block>
      )}

      {/* Finals appearances */}
      {finalsSeasons.length > 0 && (
        <Block
          title="Finals Appearances"
          deck="Solid chip = won the championship; outlined chip = lost the Finals."
        >
          <div className="flex flex-wrap gap-2">
            {finalsSeasons.map((s) => {
              const era = s.league === "ABA" ? "aba" : "nba";
              const colors = TITLE_COLORS[era];
              return (
                <span
                  key={s.year}
                  className="text-xs font-semibold px-2.5 py-1 rounded inline-flex items-center gap-1"
                  style={s.champ
                    ? { background: colors.bg, color: colors.text }
                    : { background: "transparent", color: colors.bg, border: `1px solid ${colors.bg}` }
                  }
                  title={`${s.champ ? "Won" : "Lost"} ${s.league} Finals ${s.year}`}
                >
                  {seasonLabel(s.year)}
                  {s.champ ? <span aria-hidden style={{ fontSize: "9px" }}>●</span> : null}
                </span>
              );
            })}
          </div>
        </Block>
      )}

      {/* Conference Finals appearances */}
      {cfSeasons.length > 0 && (
        <Block
          title="Conference Finals"
          deck="Every season the franchise reached the conference / division finals."
        >
          <div className="flex flex-wrap gap-2">
            {cfSeasons.map((s) => (
              <span
                key={s.year}
                className="text-xs font-medium px-2.5 py-1 rounded border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                title={`${seasonLabel(s.year)} Conference Finals${s.champ_app ? " (advanced to Finals)" : ""}`}
              >
                {seasonLabel(s.year)}
                {s.champ_app ? <span className="ml-1 opacity-70" style={{ fontSize: "9px" }}>↑</span> : null}
              </span>
            ))}
          </div>
        </Block>
      )}

      {/* All-time record */}
      <Block title="All-time record" deck={null}>
        <table className="w-full text-sm" data-no-scroll-check>
          <tbody>
            <Row k="Regular-season W-L" v={`${h.all_time_w}-${h.all_time_l}`} />
            <Row k="Win pct" v={h.win_pct.toFixed(3)} />
            <Row k="Championships" v={`${h.championships}`} />
            <Row k="Finals appearances" v={`${h.championship_appearances}`} />
            <Row k="Conference Finals appearances" v={`${h.cf_appearances}`} />
            <Row k="Playoff appearances" v={`${h.playoff_appearances}`} />
            <Row k="Total seasons" v={h.seasons.toString()} />
            <Row k="Years active" v={yearsLabel} />
            <Row k="Leagues" v={h.league_history || "—"} />
          </tbody>
        </table>
      </Block>

      {/* Season-by-season */}
      {seasonRows.length > 0 && (
        <details
          className="group mt-4 border-l-4 border-y border-r rounded-xl shadow-sm"
          style={{
            background: "var(--bg-card)",
            borderTopColor: "var(--border)",
            borderRightColor: "var(--border)",
            borderBottomColor: "var(--border)",
            borderLeftColor: "var(--accent)",
          }}
          open
        >
          <summary className="cursor-pointer px-5 sm:px-6 py-5 list-none flex items-center justify-between gap-4 hover:bg-[var(--bg-card-hover)] transition-colors rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-transform group-open:rotate-90"
                style={{ background: "rgba(78,205,196,0.16)", color: "var(--accent)" }}
              >
                ›
              </span>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-semibold tracking-tight">Season-by-season</div>
                <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                  {h.first_year} to {h.last_year} · {seasonRows.length} season{seasonRows.length === 1 ? "" : "s"} · click to toggle
                </div>
              </div>
            </div>
          </summary>
          <div className="px-5 pb-5">
            {/* Mobile: one card per season instead of an 11-column table
                forcing horizontal scroll at phone widths. Same `seasonRows`
                data as the desktop table below. */}
            <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
              <CappedList
                initial={12}
                noun="rows"
                bodyClassName="divide-y"
                items={seasonRows.map((s) => (
                <div key={s.year} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={brefYearUrl(s.year, s.league)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                      title={`${s.league} ${seasonLabel(s.year)} season on Basketball-Reference`}
                    >
                      {seasonLabel(s.year)}
                    </a>
                    <SeasonPostseasonBadge s={s} />
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    <span className="text-[var(--text)]">{s.city}</span> {s.team}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                    <SeasonStatChip label="League" value={s.league || "—"} />
                    <SeasonStatChip label="Division" value={s.division || "—"} />
                    <SeasonStatChip label="W-L" value={`${s.w || 0}-${s.l || 0}`} />
                    <SeasonStatChip label="Win%" value={s.win_pct ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"} />
                    <SeasonStatChip label="PF/G" value={s.pf_g ? s.pf_g.toFixed(1) : "—"} />
                    <SeasonStatChip label="PA/G" value={s.pa_g ? s.pa_g.toFixed(1) : "—"} />
                    <SeasonStatChip label="Place" value={s.place || "—"} />
                  </div>
                </div>
              ))}
              />
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Season</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Team</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">League</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Division</th>
                    <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">W</th>
                    <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">L</th>
                    <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Win%</th>
                    <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">PF/G</th>
                    <th className="text-right py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">PA/G</th>
                    <th className="text-left py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Place</th>
                    <th className="text-left py-2 font-medium uppercase tracking-wider text-[10px]">Postseason</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonRows.map((s) => (
                    <tr key={s.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 pr-3">
                        <a
                          href={brefYearUrl(s.year, s.league)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--text)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                          title={`${s.league} ${seasonLabel(s.year)} season on Basketball-Reference`}
                        >
                          {seasonLabel(s.year)}
                        </a>
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <span className="text-[var(--text)]">{s.city}</span>{" "}
                        <span className="text-[var(--text-muted)]">{s.team}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.league || "—"}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.division || "—"}</td>
                      <td className="py-1.5 pr-3 text-right">{s.w || ""}</td>
                      <td className="py-1.5 pr-3 text-right">{s.l || ""}</td>
                      <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                        {s.win_pct ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{s.pf_g ? s.pf_g.toFixed(1) : ""}</td>
                      <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{s.pa_g ? s.pa_g.toFixed(1) : ""}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.place || "—"}</td>
                      <td className="py-1.5">
                        <SeasonPostseasonBadge s={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {/* Footer nav */}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/teams/nba/historical" className="text-[var(--accent)] hover:underline">
          ← All defunct NBA franchises
        </Link>
        <Link href="/teams/nba" className="text-[var(--accent)] hover:underline">
          All NBA franchises
        </Link>
      </div>
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
      // min-w-0: Block is used as a grid child around wide tables, and a grid
      // item defaults to min-width:auto — without this the table inflates the
      // track and the page scrolls sideways on a phone.
      className="min-w-0 rounded-xl border p-5 mt-4"
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

// Compact labeled stat chip for season mobile cards: small uppercase label
// above a value, matching the mini-grid pattern used elsewhere (e.g.
// ChampionsTable).
function SeasonStatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="text-[var(--text-muted)]">{value}</div>
    </div>
  );
}

// Postseason badge shared by both the season-by-season table's "Postseason"
// column and its mobile card equivalent, for both the active-franchise and
// defunct-franchise season lists. `is_live`/`playoff_state_*` are only
// present on the active franchise's in-progress season row; defunct rows
// simply omit them so this collapses to the champ/champ_app/cf_app/playoff
// chain unconditionally.
function SeasonPostseasonBadge({
  s,
}: {
  s: Season & { playoff_state_label?: string; playoff_state_bg?: string; playoff_state_text?: string };
}) {
  if (s.playoff_state_label) {
    return (
      <a
        href={`https://en.wikipedia.org/wiki/${s.year}_NBA_playoffs`}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hover:opacity-80 transition-opacity"
        style={{ background: s.playoff_state_bg, color: s.playoff_state_text }}
        title={`${s.year} NBA playoffs (Wikipedia)`}
      >
        {s.playoff_state_label}
      </a>
    );
  }
  if (s.champ) {
    return s.league === "ABA" ? (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ background: TITLE_COLORS.aba.bg, color: TITLE_COLORS.aba.text }}
        title="ABA Champion (rival league, 1968-76)"
      >
        ABA Champion
      </span>
    ) : (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ background: TITLE_COLORS.nba.bg, color: TITLE_COLORS.nba.text }}
      >
        {s.league === "BAA" ? "BAA Champion" : "NBA Champion"}
      </span>
    );
  }
  if (s.champ_app) {
    return (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap border"
        style={{ borderColor: "#a07a30", color: "#a07a30" }}
      >
        Lost Finals
      </span>
    );
  }
  if (s.cf_app) {
    return (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap border"
        style={{ borderColor: "var(--text-muted)", color: "var(--text-muted)" }}
      >
        Lost Conf. Finals
      </span>
    );
  }
  if (s.playoff) {
    return (
      <span
        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
      >
        Playoffs
      </span>
    );
  }
  return null;
}
