import type { Metadata } from "next";
import Link from "next/link";
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
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
  abbreviateState,
  brefYearUrl,
  type Season,
} from "@/lib/mlb";
import { getCurrentMlbStandings } from "@/lib/mlb-standings";
import SeasonsByTeamTable from "./SeasonsByTeamTable";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllFranchiseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
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

const AWARD_ORDER: string[] = [
  "AL Most Valuable Player",
  "NL Most Valuable Player",
  "AL Cy Young",
  "NL Cy Young",
  "AL Rookie of the Year",
  "NL Rookie of the Year",
  "AL Manager of the Year",
  "NL Manager of the Year",
  "World Series MVP",
  "ALCS MVP",
  "NLCS MVP",
  "All-Star Game MVP",
  "Hank Aaron Award AL",
  "Hank Aaron Award NL",
  "Roberto Clemente Award",
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
  if (!f) notFound();

  const champs = getChampionships(f.canonical);
  const champAppearances = getChampionshipAppearances(f.canonical);
  const stadiums = getStadiumHistory(f.canonical);
  const awards = getAwards(f.canonical);
  const seasons = getSeasons(f.slug);
  const topGames = getTopGamesForTeam(f.slug);
  const mono = monogramFor(f.slug);
  const logo = logoUrlFor(f.slug);
  const formerly = priorCitySummary(f);

  // Live current-season standings from ESPN. Same gate behaviour as the
  // NFL pages: only render the in-progress row once regular-season games
  // have been played. Anything earlier (spring training, offseason, ESPN
  // unreachable) is hidden entirely.
  const standings = await getCurrentMlbStandings();
  const liveStanding = standings.by_canonical[f.canonical];
  const showLiveRow =
    !!liveStanding &&
    (standings.season_type === "regular" || standings.season_type === "postseason") &&
    liveStanding.games_played > 0;
  const liveSeasonRow: (Season & { is_live: true }) | null = showLiveRow
    ? {
        year: standings.season_year,
        league: "MLB",
        city: f.city,
        team: f.name,
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
  const seasonRows: Array<Season & { is_live?: true }> = liveSeasonRow
    ? [liveSeasonRow, ...[...seasons].reverse()]
    : [...seasons].reverse();
  const seasonRangeEnd = liveSeasonRow
    ? liveSeasonRow.year
    : seasons[seasons.length - 1]?.year ?? new Date().getFullYear() - 1;

  // Resolve opponent slugs server-side for top-games rows so the renderer
  // can link to active franchise pages and fall back to plain text for
  // defunct / pre-WS opponents.
  const topGamesWithOppSlug = topGames.map((g) => {
    const opp = getFranchiseByCanonical(g.opp_canonical);
    return { ...g, opp_slug: opp?.slug ?? null };
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/mlb" className="hover:text-[var(--text)]">MLB</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.display_name}</span>
      </nav>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${f.display_name} logo`}
            className="w-20 h-20 flex-shrink-0 object-contain"
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
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Founded {f.founding_year ?? "—"} in{" "}
            {f.metro_slug ? (
              <Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{f.metro}</Link>
            ) : (
              <span className="text-[var(--text)]">{f.metro}</span>
            )}
            {f.conf ? <>{" · "}{f.conf}</> : null}
            {f.division ? <>{" · "}{f.division}</> : null}
            {" · "}Home: <span className="text-[var(--text)]">{f.stadium}</span>
          </p>
          {formerly && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">
              Formerly based in {formerly}.
            </p>
          )}
        </div>
      </header>

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
        <StatCell v={f.division_titles.toString()} k="Division titles" />
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

      {/* Championship appearances (wins + losses combined) */}
      <Block
        title="Championship appearances"
        deck="Every World Series appearance and pre-1903 cup appearance. Solid chip = won; outlined chip = lost."
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
          <table className="w-full text-sm">
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

      {/* Award winners */}
      <Block
        title="Award winners"
        deck={`League-wide awards held by ${f.name} players or managers. Curated to the headline tier: MVP, Cy Young, Rookie of the Year, Manager of the Year, postseason MVPs, Hank Aaron, Roberto Clemente, and the rare Triple Crown.`}
      >
        {Object.keys(awards).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No awards in this dataset.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {AWARD_ORDER.map((awardKey) => {
              const winners = awards[awardKey];
              if (!winners || winners.length === 0) return null;
              return (
                <div key={awardKey}>
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

      {/* Top postseason games */}
      <Block
        title="Top 12 postseason games"
        deck="Highest-rated postseason games in franchise history by the site's Game Score metric, which combines hype, quality, stakes, and matchup rank. Losses can outrank routine wins because the formula scores game quality, not franchise spin."
      >
        {topGamesWithOppSlug.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No postseason games scored.</p>
        ) : (
          <div className="overflow-x-auto">
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
                        {g.stadium ? (
                          <div
                            className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                            style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                            title={g.stadium}
                          >
                            {g.stadium}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right font-semibold">{g.game_score.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      {/* Season-by-season */}
      <details className="mt-4 border rounded-xl" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <summary className="cursor-pointer px-5 py-4 font-semibold text-sm flex items-center justify-between">
          <span>Season-by-season ({f.founding_year} to {seasonRangeEnd})</span>
          <span className="text-[var(--text-muted)] text-xs">{seasonRows.length} seasons</span>
        </summary>
        <div className="px-5 pb-5">
          <SeasonsByTeamTable
            rows={seasonRows}
            sourceLabel={standings.source_label || undefined}
          />
        </div>
      </details>
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
