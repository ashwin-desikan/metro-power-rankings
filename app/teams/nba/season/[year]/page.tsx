import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNbaEloIndex, getNbaEloSeason, isRated } from "@/lib/nbaElo";
import {
  getFranchiseByCanonical,
  nbaLineColor,
  seasonLabel,
  brefYearUrl,
} from "@/lib/nba";
import { SectionHead } from "@/app/_shared/SectionHead";
import WeeklyEloChart from "../_shared/WeeklyEloChart";
import SeasonStandings from "../_shared/SeasonStandings";
import PlayoffBracket from "../_shared/PlayoffBracket";
import TopGames from "../_shared/TopGames";
import SeasonHonours from "../_shared/SeasonHonours";
import SeasonJumper from "../_shared/SeasonJumper";
import { WeekScrubberProvider, WeekScrubberControl } from "../_shared/WeekScrubber";
import { getNbaCupFinalForYear } from "@/lib/nbaCup";

// One NBA season, week by week.
//
// ROUTE SHAPE. /teams/nba/season/[year], not /teams/nba/[year], because
// /teams/nba/[slug] already owns that dynamic slot and a franchise slug and a
// season year would collide. The NFL solved the same collision the same way.
//
// 🔴 THE SEASON YEAR IS THE END YEAR. 2026 is the 2025-26 season, which is the
// workbook's convention throughout. Every user-facing string goes through
// seasonLabel() so a reader never sees a bare "2026" for a season that began
// in October 2025.

export const revalidate = 86400;

const FIRST = 1947;

export async function generateStaticParams() {
  // Prerender the last ten seasons; the other seventy render on demand and
  // are then cached for a day. 80 seasons is not a large enough tail to be
  // worth building every one on every deploy.
  const idx = await getNbaEloIndex();
  const last = idx?.seasons?.[idx.seasons.length - 1]?.season ?? 2026;
  return Array.from({ length: 10 }, (_, i) => ({ year: String(last - i) }));
}

type Props = { params: Promise<{ year: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const season = Number(year);
  if (!Number.isInteger(season)) return { title: "NBA season" };
  const label = seasonLabel(season);
  return {
    title: `${label} NBA season`,
    description: `Every NBA team's Elo rating week by week through the ${label} season, with the table as it stood after any week.`,
    alternates: { canonical: `/teams/nba/season/${season}` },
  };
}

export default async function NbaSeasonPage({ params }: Props) {
  const { year } = await params;
  const season = Number(year);
  if (!Number.isInteger(season) || season < FIRST) notFound();

  const [data, index] = await Promise.all([getNbaEloSeason(season), getNbaEloIndex()]);
  if (!data || !data.teams.length) notFound();

  const label = seasonLabel(season);
  const row = index?.seasons.find((s) => s.season === season) ?? null;
  const prev = index?.seasons.find((s) => s.season === season - 1) ?? null;
  const next = index?.seasons.find((s) => s.season === season + 1) ?? null;

  // Identity and colour resolved ONCE, server side, because the lookup touches
  // the franchise file and the chart alone would otherwise ask thirty times.
  // Keyed on the workbook canonical name, the only join key the spine carries.
  const slugByName: Record<string, string | null> = {};
  const colorByName: Record<string, string | null> = {};
  for (const t of data.teams) {
    const f = getFranchiseByCanonical(t.name);
    slugByName[t.name] = f?.slug ?? null;
    colorByName[t.name] = nbaLineColor(f?.slug ?? null);
  }

  // That season's NBA Cup final, if it had one. The standings need its DATE, not
  // just who won: the final counts toward neither season column in the workbook, so
  // before it a week's record is all regular season and from it the Cup result
  // belongs in the Playoffs column (Ashwin, 2026-09-19).
  const cupFinal = getNbaCupFinalForYear(Number(year));

  // 🔴 AN UPCOMING SEASON HAS A FIELD AND NOTHING ELSE. No ratings, no weeks,
  // no bracket. Every plotting component below is given only RATED teams, so
  // an upcoming season renders the field and stops rather than drawing an
  // empty chart with a legend and an axis and no lines, which is worse than
  // drawing nothing because it looks broken rather than early.
  const upcoming = data.status === "upcoming";
  const rated = data.teams.filter(isRated);

  // A season with nothing after its seed has nothing to scrub, so it gets no
  // provider and every consumer then renders the whole season as before.
  const seeded = data.status === "seeded" || data.status === "broken";
  const weekNums = data.teams.flatMap((t) => t.weeks.map((w) => w.w));
  const scrubMin = weekNums.length ? Math.min(...weekNums) : 0;
  const scrubMax = weekNums.length ? Math.max(...weekNums) : 0;

  const champion = data.teams.find((t) => t.flags?.champ) ?? null;
  const top = [...rated].sort((a, b) => b.end - a.end)[0] ?? null;
  // Worth saying out loud when it happens: the best rating did not win.
  const topDidNotWin = champion && top && champion.name !== top.name;

  const asOf = data.teams
    .flatMap((t) => t.weeks.map((w) => w.d))
    .filter(Boolean)
    .sort()
    .pop();

  // The field, by division, for a season that has not started. It is the only
  // thing that is actually known about it.
  const fieldByDiv = (() => {
    const m = new Map<string, typeof data.teams>();
    for (const t of data.teams) {
      const k = `${t.conf ?? ""}|${t.div ?? ""}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const body = upcoming ? (
    <section className="mb-8">
      <SectionHead
        title="The field"
        sub="Thirty teams, six divisions. Nothing has been played yet."
        more={
          <p>
            This season has not started, so there is no rating, no table and no
            bracket to show. Those appear as the season is played rather than
            being projected here: the ratings this site carries are a record of
            what happened, not a forecast of what will.
          </p>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {fieldByDiv.map(([k, list]) => {
          const [conf, div] = k.split("|");
          return (
            <div key={k} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {conf} · {div}
              </h3>
              <ul className="space-y-1">
                {[...list].sort((a, b) => (a.city ?? "").localeCompare(b.city ?? "")).map((t) => {
                  const slug = slugByName[t.name];
                  const label = `${t.city ?? ""} ${t.team ?? t.name}`.trim();
                  return (
                    <li key={t.name} className="flex items-center gap-2">
                      <span aria-hidden className="shrink-0 rounded-sm"
                        style={{ background: colorByName[t.name] ?? "var(--text-dim)", width: 3, height: 14 }} />
                      {/* The minimum belongs on the anchor. On the <li> it
                          measures right and still misses the tap target. */}
                      {slug ? (
                        <Link
                          href={`/teams/nba/${slug}`}
                          className="flex items-center min-h-11 sm:min-h-0 text-sm truncate hover:text-[var(--accent)]"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="text-sm truncate">{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  ) : (
    <>
      <section className="mb-8">
        <SectionHead
          title="The race"
          sub="Elo rating by week. Higher is stronger; 1500 is average."
          more={
            <>
              <p>
                Elo moves after every game by how surprising the result was and
                by how big the margin was, damped so a blowout by a heavy
                favourite counts for less than the same blowout by an underdog.
                One pool per season, so the ratings are comparable across the
                whole league but not across eras.
              </p>
              <p className="mt-2">
                Week 0 is the preseason seed, carried over from the previous
                season and adjusted by hand for the roster as it stands. It is
                an input to the season, not a result of it.
              </p>
            </>
          }
        />
        {!seeded && scrubMax > scrubMin && <WeekScrubberControl className="mt-3 mb-3" />}
        {/* Only rated teams are plotted. An upcoming season never reaches
            here, but a seeded one can carry a club with no weeks yet. */}
        <WeeklyEloChart teams={rated} season={season} colorByName={colorByName} />
      </section>

      <section className="mb-8">
        <SectionHead
          title="The table"
          sub="Where every team stood, scrubbed to the week above."
          more={
            <p>
              Three records, because they are three different things. Regular
              season is the 82-game year and is what the seeding comes from.
              Playoffs is the postseason run, blank for a team that did not
              make it, which is not the same as 0-0. Total is the two added
              together. The Elo column keeps moving through the postseason, so
              a team can climb after its regular season has finished. The NBA
              Cup final counts toward neither the regular season nor the
              playoffs officially; from its date it is carried in the Playoffs
              column here, so the two finalists read one game more than the
              official postseason record.
            </p>
          }
        />
        <SeasonStandings
          teams={data.teams}
          slugByName={slugByName}
          colorByName={colorByName}
          cup={cupFinal ? { date: cupFinal.date, winner: cupFinal.winner, loser: cupFinal.loser } : null}
        />
      </section>

      {data.bracket?.length ? (
        <section className="mb-8">
          <SectionHead
            title="The postseason"
            sub="Every series, round by round, with the seeds that met."
            more={
              <p>
                Rounds run left to right in the order they were played. The
                field, the number of rounds and the series length have all
                changed repeatedly, so the shape here is whatever that season
                actually had rather than a modern bracket imposed on it. From
                2020 the play-in sits below the bracket: those games decided
                who entered, so a team beaten there did not have a playoff run.
              </p>
            }
          />
          <PlayoffBracket
            bracket={data.bracket}
            season={season}
            slugByName={slugByName}
            colorByName={colorByName}
          />
        </section>
      ) : null}

      {data.awards?.length || data.all_star ? (
        <section className="mb-8">
          <SectionHead
            title="The honours"
            sub="Who won what, and who was picked."
            more={
              <p>
                Every other section on this page is a club. These are the
                people: the individual awards, the All-NBA teams and the
                All-Star selections, all as the workbook records them. A
                player&rsquo;s All-Star entry carries which appearance it was
                for them, so a seventh selection reads differently from a
                first.
              </p>
            }
          />
          <div className="mt-4">
            <SeasonHonours
              awards={data.awards ?? []}
              allStar={data.all_star}
              slugByName={slugByName}
            />
          </div>
        </section>
      ) : null}

      {data.top_games?.length ? (
        <section className="mb-8">
          <SectionHead
            title="The best games"
            sub={`The ${data.top_games.length} highest-rated games of the season, best first.`}
            more={
              <p>
                Game Score is a composite rating of how good a game was to
                watch, built from how close it finished, how much the result
                went against the odds, how far the ratings moved, what was at
                stake and how highly rated both sides were. It is roughly
                zero-centred, so an average game sits near zero and anything
                past two is rare. It is the same metric the all-time and
                by-decade boards use, so a game keeps the same score wherever
                it appears.
              </p>
            }
          />
          <TopGames
            games={data.top_games}
            slugByName={slugByName}
            colorByName={colorByName}
          />
        </section>
      ) : null}
    </>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* app/_shared/HubBackLink is hardcoded to /time-machine, so it is not
          the component for this. A plain link keeps the same idiom. */}
      <Link
        href="/teams/nba/season"
        className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-[11px] uppercase tracking-widest text-[var(--text-dim)] transition-colors hover:text-[var(--accent)]"
      >
        ← NBA seasons
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold">{label} NBA season</h1>
        <p
          className="mt-1 text-[11px] uppercase tracking-wider text-[var(--text-dim)]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {data.teams.length} teams
          {row?.weeks ? ` · ${row.weeks} weeks` : ""}
          {asOf ? ` · through ${asOf}` : ""}
          {" · "}Elo from the project workbook
        </p>

        {(champion || top) && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {champion && (
              <>
                <strong className="text-[var(--text)]">
                  {champion.city} {champion.team ?? champion.name}
                </strong>{" "}
                won the title.{" "}
              </>
            )}
            {top && (
              <>
                {topDidNotWin ? "The season's highest rating belonged to " : "They also finished top rated, at "}
                {topDidNotWin ? (
                  <>
                    <strong className="text-[var(--text)]">
                      {top.city} {top.team ?? top.name}
                    </strong>
                    , at {Math.round(top.end)}.
                  </>
                ) : (
                  <>{Math.round(top.end)}.</>
                )}
              </>
            )}
          </p>
        )}
      </header>

      {/* Tap targets clear 44px on a phone, per DESIGN-STANDARDS. A bare
          text link here measured under 40 on the mobile probe. */}
      <nav className="flex items-center justify-between mb-6 text-sm">
        {prev ? (
          <Link
            href={`/teams/nba/season/${prev.season}`}
            className="inline-flex items-center min-h-11 px-2 -ml-2 rounded-md hover:text-[var(--accent)]"
          >
            ← {seasonLabel(prev.season)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/teams/nba/season/${next.season}`}
            className="inline-flex items-center min-h-11 px-2 -mr-2 rounded-md hover:text-[var(--accent)]"
          >
            {seasonLabel(next.season)} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {/* Every season reachable from every season, so a reader never has to go
          back to the archive to change year. Collapsed by default: it is a
          control, not content. */}
      {index?.seasons?.length ? (
        <div className="mb-6">
          <SeasonJumper rows={index.seasons} current={season} />
        </div>
      ) : null}

      {seeded || scrubMax <= scrubMin ? (
        body
      ) : (
        <WeekScrubberProvider minWeek={scrubMin} maxWeek={scrubMax}>
          {body}
        </WeekScrubberProvider>
      )}

      <section className="mt-10 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">Sources</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Weekly Elo ratings and records are maintained in the project&apos;s NBA
          workbook and refreshed when it is updated. Season results and honours
          come from the same workbook.{" "}
          <a
            href={brefYearUrl(season, data.leagues[0] ?? "NBA")}
            className="hover:text-[var(--accent)] underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Basketball-Reference, {label}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
