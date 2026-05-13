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
  getSeasons,
  getProBowlCount,
  getTopGamesForTeam,
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
  lookupStadiumLocation,
  abbreviateState,
  getFranchiseByCanonical,
  type Season,
} from "@/lib/nfl";
import { getCurrentNflStandings } from "@/lib/standings";
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
  const url = `${BASE_URL}/teams/nfl/${f.slug}`;
  const desc =
    `${f.name}: ${f.championships} league championships, all-time record ${f.all_time_w}-${f.all_time_l}-${f.all_time_t} (${f.win_pct.toFixed(3)}), founded ${f.founding_year}. Plays in ${f.stadium}, ${f.metro}.`;
  return {
    title: f.name,
    description: desc,
    alternates: { canonical: `/teams/nfl/${f.slug}` },
    openGraph: { title: `${f.name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${f.name} | ${SITE_NAME}`, description: desc },
  };
}

// Curated list of major awards to surface on each team page in v1.
// Order is editorial: MVP first, then headline-level player awards,
// then rookies, then situational. UPI AFL awards omitted by design;
// they appear infrequently and would clutter most franchise pages.
const AWARD_ORDER: string[] = [
  "AP NFL MVP",
  "Super Bowl MVP",
  "AP Offensive Player",
  "AP Defensive Player",
  "AP Coach of the Year",
  "Bert Bell Award",
  "Walter Payton MOY",
  "AP Comeback Player",
  "AP Offensive Rookie",
  "AP Defensive Rookie",
];

function priorCitySummary(f: ReturnType<typeof getFranchiseBySlug>): string | null {
  if (!f || f.prior_cities.length === 0) return null;
  // The workbook stores the historical-city string sometimes with multiple
  // values concatenated (e.g. "Cleveland/Los Angeles/St. Louis/Los Angeles").
  // We render the distinct prior cities as a single comma-separated phrase.
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
  const proBowlCount = getProBowlCount(f.canonical);
  const topGames = getTopGamesForTeam(f.slug);
  const mono = monogramFor(f.slug);
  const logo = logoUrlFor(f.slug);
  const formerly = priorCitySummary(f);
  // Live current-season standings from ESPN. Async + ISR-cached via Next.
  // Used ONLY to prepend an in-progress row to the Season-by-season table
  // once regular-season games have been played. Anything that happens
  // earlier (offseason, preseason, ESPN unreachable) is hidden entirely:
  // the team page surfaces nothing about the current year until games
  // have actually been played. The workbook absorbs the season after it
  // wraps and the live row is replaced on the next ETL pass.
  const standings = await getCurrentNflStandings();
  const liveStanding = standings.by_canonical[f.canonical];
  const showLiveRow =
    !!liveStanding &&
    (standings.season_type === "regular" || standings.season_type === "postseason") &&
    liveStanding.games_played > 0;
  const liveSeasonRow: (Season & { is_live: true }) | null = showLiveRow
    ? {
        year: standings.season_year,
        league: "NFL",
        city: f.city,
        team: f.name,
        w: liveStanding.wins,
        l: liveStanding.losses,
        t: liveStanding.ties,
        win_pct: liveStanding.win_pct,
        pf: liveStanding.points_for,
        pa: liveStanding.points_against,
        division: liveStanding.division || seasons[seasons.length - 1]?.division || "",
        place: liveStanding.division_rank ? `#${liveStanding.division_rank}` : "",
        playoff: false,
        div_title: false,
        conf_final: false,
        champ_app: false,
        champ: false,
        is_live: true,
      }
    : null;
  const seasonRows: Array<Season & { is_live?: true }> = liveSeasonRow
    ? [liveSeasonRow, ...[...seasons].reverse()]
    : [...seasons].reverse();
  const seasonRangeEnd = liveSeasonRow
    ? liveSeasonRow.year
    : seasons[seasons.length - 1]?.year ?? new Date().getFullYear() - 1;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nfl" className="hover:text-[var(--text)]">NFL</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.name}</span>
      </nav>

      {/* Hero */}
      <header
        className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${f.name} logo`}
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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.name}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Founded {f.founding_year ?? "—"} in{" "}
            {f.metro_slug ? (
              <Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{f.metro}</Link>
            ) : (
              <span className="text-[var(--text)]">{f.metro}</span>
            )}
            {" · "}{f.conf}{" · "}{f.division}{" · "}Home: <span className="text-[var(--text)]">{f.stadium}</span>
          </p>
          {formerly && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">
              Formerly based in {formerly}.
            </p>
          )}
        </div>
      </header>

      {/* Headline stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        <StatCell
          v={f.championships.toString()}
          k="League titles"
          sub={`${champs.filter(c => c.era === "pre_sb").length} pre-SB · ${champs.filter(c => c.era === "sb").length} SB era`}
        />
        <StatCell v={f.division_titles.toString()} k="Division titles" />
        <StatCell v={f.playoff_appearances.toString()} k="Playoff appearances" sub={`Postseason ${f.playoff_w}-${f.playoff_l}`} />
        <StatCell v={f.win_pct.toFixed(3)} k="All-time win pct" />
        <StatCell v={f.seasons.toString()} k="Seasons" sub={`since ${f.founding_year ?? "—"}`} />
      </div>

      {/* Championships timeline */}
      <Block title="Championships" deck="Pre-Super Bowl titles in slate; Super Bowl era titles in gold.">
        {champs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No league championships yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {champs.map((c) => {
                const colors = TITLE_COLORS[c.era];
                const label = c.era === "sb" ? `SB ${superBowlRoman(c.year)} (${c.year})` : `${c.year}`;
                return (
                  <span
                    key={c.year}
                    className="text-xs font-semibold px-2.5 py-1 rounded"
                    style={{ background: colors.bg, color: colors.text }}
                    title={c.record ? `${c.record} regular season` : undefined}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.pre_sb.bg }} />
                NFL / AAFC / AFL Championship (1920-1965)
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.sb.bg }} />
                Super Bowl (1966-present)
              </span>
            </div>
          </>
        )}
      </Block>

      {/* Championship appearances (wins + losses combined) */}
      <Block
        title="Championship appearances"
        deck="Every championship game appearance, win or loss. Solid chip = won; outlined chip = lost. Same pre-Super Bowl / Super Bowl color split as titles."
      >
        {champAppearances.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No championship game appearances.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {champAppearances.map((a) => {
              const colors = TITLE_COLORS[a.era];
              const label = a.era === "sb" ? `SB ${superBowlRoman(a.year)} (${a.year})` : `${a.year}`;
              return (
                <span
                  key={a.year}
                  className="text-xs font-semibold px-2.5 py-1 rounded inline-flex items-center gap-1"
                  style={a.is_winner
                    ? { background: colors.bg, color: colors.text }
                    : { background: "transparent", color: colors.bg, border: `1px solid ${colors.bg}` }
                  }
                  title={`${a.is_winner ? "Won" : "Lost"} ${a.record ? `(${a.record} regular season)` : ""}`}
                >
                  {label}
                  {a.is_winner ? <span aria-hidden style={{ fontSize: "9px" }}>●</span> : null}
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
              <Row k="Regular-season W-L-T" v={`${f.all_time_w}-${f.all_time_l}-${f.all_time_t}`} />
              <Row k="Win pct" v={f.win_pct.toFixed(3)} />
              <Row k="Playoff record" v={`${f.playoff_w}-${f.playoff_l}-${f.playoff_t} (${f.playoff_win_pct.toFixed(3)})`} />
              <Row k="Championship appearances" v={`${champAppearances.length} (${champs.length} wins)`} />
              <Row k="Conference final appearances" v={`${f.conf_finals_app} (${f.conf_finals_wins} wins)`} />
              <Row k="Total seasons" v={f.seasons.toString()} />
              <Row k=".500 or better seasons" v={f.seasons_500_plus.toString()} />
              <Row k="Most recent championship" v={f.last_championship ? f.last_championship.toString() : "—"} />
            </tbody>
          </table>
        </Block>

        {/* Stadium history */}
        <Block title="Stadium history" deck="Grouped by physical building. Naming-rights eras nested.">
          {stadiums.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">No stadium history available.</p>
          ) : (
            <div className="space-y-2">
              {stadiums.map((b) => (
                <div
                  key={b.canonical}
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
                    {b.city}{b.state ? `, ${b.state}` : ""}
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
        deck={`League-wide awards held by ${f.name} players or coaches. Pulled from the AP, Bert Bell, Walter Payton, and Super Bowl MVP rolls. Plus ${proBowlCount} Pro Bowl selections all-time.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {AWARD_ORDER.map((awardKey) => {
            const winners = awards[awardKey];
            if (!winners || winners.length === 0) return null;
            return (
              <div key={awardKey}>
                <h3 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-1">
                  {awardKey}
                </h3>
                <ul className="text-sm space-y-0.5">
                  {winners.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[var(--text-muted)] tabular-nums w-12 flex-shrink-0">{w.year}</span>
                      <span>{w.player}{w.position ? <span className="text-[var(--text-muted)]"> · {w.position}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {/* Hall of Fame inductees temporarily suppressed; will return once
              the data reconciliation pass completes. */}
        </div>
      </Block>

      {/* Top games — ranked by DU Game Score */}
      <Block
        title="Top 12 games"
        deck={`Highest-rated games in franchise history by the site's Game Score (ELO) metric, which combines hype, quality, stakes, and matchup rank. Losses can outrank routine wins because the formula scores game quality, not franchise spin.`}
      >
        {topGames.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No scored games in the dataset.</p>
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
                {topGames.map((g, i) => {
                  const isLoss = g.result === "L";
                  const isTie = g.result === "T";
                  return (
                    <tr
                      key={`${g.year}-${g.opp_canonical}-${i}`}
                      className="border-t"
                      style={{
                        borderColor: "var(--border)",
                        background: isLoss ? "rgba(239,68,68,0.04)" : undefined,
                      }}
                    >
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">
                        {g.year}{g.round ? ` ${roundLabel(g.year, g.round)}` : ""}{g.week ? ` · Wk ${g.week}` : ""}
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
                          {g.ot ? " · OT" : ""}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="leading-tight">
                          {(() => {
                            // Mirror the league-wide TopGamesTable scoreline:
                            // winner first, bolded; loser muted on the right.
                            // The team is on the left when the row is a W or T;
                            // for losses we put the opponent on the left so the
                            // bolded "winner" position stays consistent.
                            //
                            // Names use team_city / team from the row, NOT the
                            // franchise's current name, so the era-correct name
                            // surfaces (e.g. "Houston Oilers" on a Tennessee
                            // Titans row from 1995). Links still resolve to the
                            // current franchise slug for both sides.
                            const isLoss = g.result === "L";
                            const isTie = g.result === "T";
                            const oppF = getFranchiseByCanonical(g.opp_canonical);
                            const teamSide = { city: g.team_city, team: g.team, slug: f.slug, score: g.pf };
                            const oppSide = { city: g.opp_city, team: g.opp_team, slug: oppF?.slug, score: g.pa };
                            const left = isLoss ? oppSide : teamSide;
                            const right = isLoss ? teamSide : oppSide;
                            const renderName = (side: { city: string; team: string; slug: string | undefined }, bold: boolean) => {
                              const label = `${side.city} ${side.team}`;
                              const cls = bold ? "font-semibold" : "text-[var(--text-muted)]";
                              if (side.slug) {
                                return (
                                  <Link href={`/teams/nfl/${side.slug}`} className={`${cls} hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2`}>
                                    {label}
                                  </Link>
                                );
                              }
                              return <span className={cls}>{label}</span>;
                            };
                            return (
                              <>
                                {renderName(left, !isTie)}{" "}
                                <span className="tabular-nums font-semibold" style={{ color: isTie ? "var(--text-muted)" : "var(--accent)" }}>{left.score}</span>
                                <span className="mx-1 text-[var(--text-dim)]">{isTie ? "=" : "-"}</span>
                                <span className="tabular-nums text-[var(--text-muted)]">{right.score}</span>{" "}
                                {renderName(right, false)}
                              </>
                            );
                          })()}
                        </div>
                        {g.stadium ? (() => {
                          const loc = lookupStadiumLocation(g.stadium);
                          const subtitle = loc
                            ? `${g.stadium} · ${loc.city}${loc.state ? ", " + abbreviateState(loc.state) : ""}`
                            : g.stadium;
                          return (
                            <div
                              className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                              style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                              title={subtitle}
                            >
                              {g.stadium}
                              {loc ? (
                                <span className="ml-1 opacity-80">· {loc.city}{loc.state ? `, ${abbreviateState(loc.state)}` : ""}</span>
                              ) : null}
                            </div>
                          );
                        })() : null}
                      </td>
                      <td className="py-2 text-right font-semibold">{g.du.toFixed(3)}</td>
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
            week={standings.week}
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
      <div className={deck ? "" : "mt-1"}>{children}</div>
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

function superBowlRoman(seasonYear: number): string {
  const sbNumber = seasonYear - 1965;
  if (sbNumber < 1) return "";
  // NFL officially branded the 50th Super Bowl as "Super Bowl 50" in 2015,
  // breaking the Roman-numeral tradition because "Super Bowl L" looked
  // unfortunate on logos. Honor that convention.
  if (sbNumber === 50) return "50";
  return toRoman(sbNumber);
}

// Transform a bare "Super Bowl" round label into the numbered form
// ("SB 50" or "SB " + roman). Any other round string passes through.
function roundLabel(seasonYear: number, round: string): string {
  if (round !== "Super Bowl") return round;
  return "SB " + superBowlRoman(seasonYear);
}

function toRoman(num: number): string {
  const lookup: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, sym] of lookup) {
    while (num >= value) { result += sym; num -= value; }
  }
  return result;
}
