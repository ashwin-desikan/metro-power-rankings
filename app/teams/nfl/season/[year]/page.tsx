import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { TableScroll } from "@/app/_shared/TableScroll";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";
import { getNflEloIndex, getNflEloSeason, getNflUpcoming } from "@/lib/nflElo";
import WeeklyEloChart from "../_shared/WeeklyEloChart";
import TeamCell, { type TeamIdent } from "../_shared/TeamCell";
import { seasonHasHonours } from "../_shared/HonoursStrip";
import SeasonStandings, { type StandingsTeam } from "../_shared/SeasonStandings";
import ExpectationPreview from "../_shared/ExpectationPreview";
import {
  getTopGamesForYear, getNflSlugByTeamName, nflSlugForCanonical, nflLineColor,
  logoUrlFor, monogramFor, MONOGRAM_BY_SLUG,
} from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// One NFL season, from the weekly Elo spine.
//
// 🔴 ROUTE SHAPE. This is /teams/nfl/season/[year] and not /teams/nfl/[year],
// because /teams/nfl/[slug] already owns the dynamic slot at that level for 78
// franchises. Football solved the same collision with 67 literal season
// directories; NFL has 107 seasons and its own precedent for a nested dynamic
// season route in /teams/nfl/expectation/[season], so it takes the nested one.
//
// 🔴 A SEEDED SEASON IS NOT A PLAYED ONE. 2026 carries only its preseason seed
// because the workbook's Elo chain has no results to consume yet, so it
// renders a preseason board and its priced week-1 games rather than a chart of
// one point. See lib/nflElo.ts.

export const revalidate = 86400;

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };
const FIRST = 1920;
const LAST = 2026;

export async function generateStaticParams() {
  // The recent decade is prerendered; the other ~97 render on demand and cache,
  // the same bargain /teams/nfl/expectation/[season] already makes.
  const out: { year: string }[] = [];
  for (let s = LAST; s >= LAST - 9; s--) out.push({ year: String(s) });
  return out;
}

function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= FIRST && n <= LAST ? n : null;
}

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const { year } = await params;
  const n = parseYear(year);
  if (!n) return {};
  const title = `${n} NFL season`;
  const description = `Every team's Elo rating week by week through the ${n} season, with the final standings and the biggest movers, on one model that runs from 1920 to today.`;
  return {
    title,
    description,
    alternates: { canonical: `/teams/nfl/season/${n}` },
    openGraph: {
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${BASE_URL}/teams/nfl/season/${n}`,
      type: "website",
    },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function NflSeasonPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const season = parseYear(year);
  if (!season) notFound();

  const [data, index, upcoming] = await Promise.all([
    getNflEloSeason(season).catch(() => null),
    getNflEloIndex().catch(() => null),
    getNflUpcoming().catch(() => null),
  ]);
  if (!data) notFound();

  const seeded = data.status !== "final";

  // Identity and colour are resolved ONCE per season, server side, because both
  // touch the filesystem (logoUrlFor stats a path) and the chart alone would
  // otherwise ask 32 times. Keyed on the workbook's canonical name, which is
  // the only join key the Elo spine carries.
  const ident: Record<string, TeamIdent> = {};
  const colorByName: Record<string, string | null> = {};
  for (const t of data.teams) {
    const slug = nflSlugForCanonical(t.name);
    ident[t.name] = {
      slug,
      logo: slug ? logoUrlFor(slug) : null,
      mono: slug && MONOGRAM_BY_SLUG[slug] ? monogramFor(slug) : null,
    };
    colorByName[t.name] = nflLineColor(slug);
  }
  const showHonours = seasonHasHonours(data.teams);
  const standingsTeams: StandingsTeam[] = data.teams.map((t) => ({
    name: t.name, city: t.city, team: t.team,
    league: t.league, conf: t.conf, div: t.div,
    end: t.end, rec: t.rec, pts: t.pts, seed: t.seed, flags: t.flags,
    slug: ident[t.name].slug, logo: ident[t.name].logo, mono: ident[t.name].mono,
  }));
  const showSeeds = data.teams.some((t) => t.seed != null);
  const ranked = [...data.teams].sort((a, b) => b.end - a.end);
  const movers = [...data.teams]
    .map((t) => ({ t, delta: t.end - t.start }))
    .sort((a, b) => b.delta - a.delta);
  const moversMax = Math.max(...movers.map((m) => Math.abs(m.delta)), 1);

  const rows = index?.seasons ?? [];
  const prev = rows.filter((r) => r.season < season).slice(-1)[0] ?? null;
  const next = rows.find((r) => r.season > season) ?? null;

  // 🔴 GATED ON THE CHAMPIONSHIP, NOT ON THE CALENDAR. A "best games of 2026"
  // board in November would rank three weeks of football against a finished
  // season, so the board waits until a champion is flagged in the workbook.
  const bestGames = data.complete ? getTopGamesForYear(season) : [];

  const wk1 = seeded && upcoming?.season === season
    ? upcoming.schedule.filter((g) => g.p_home != null).sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];

  const stamp = [
    `${data.teams.length} teams`,
    data.leagues.join(" + "),
    seeded ? "preseason ratings only" : `weeks ${data.teams[0]?.weeks[0]?.w ?? 0}–${Math.max(...data.teams.flatMap((t) => t.weeks.map((w) => w.w)))}`,
    `built ${data.meta.generated_at.slice(0, 10)}`,
  ].join(" · ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/nfl" className="hover:underline">NFL</Link>{" / "}
        <span>{season}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">🏈 The {season} NFL season</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          {seeded ? (
            <>Every team&rsquo;s rating going into the season, on the same model that has run since 1920.
              Nothing has been played, so nothing after the preseason seed is shown.</>
          ) : (
            <>Every team&rsquo;s rating, week by week, on one model that runs from 1920 to today.
              A rating is what the season looked like as it happened, not what the final table says.</>
          )}
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>{stamp}</div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {prev ? <Link href={`/teams/nfl/season/${prev.season}`} className="text-[var(--accent)] hover:underline">&larr; {prev.season}</Link> : null}
          {next ? <Link href={`/teams/nfl/season/${next.season}`} className="text-[var(--accent)] hover:underline">{next.season} &rarr;</Link> : null}
          <Link href={`/teams/nfl/expectation/${season}`} className="text-[var(--accent)] hover:underline">Against expectation, {season}</Link>
        </div>
      </header>

      <HubNav items={[
        { label: seeded ? "Preseason board" : "The season, week by week", href: "#race" },
        ...(wk1.length ? [{ label: "Week 1, priced", href: "#week1" }] : []),
        { label: "Standings", href: "#standings" },
        ...(bestGames.length ? [{ label: "Greatest games", href: "#games" }] : []),
        { label: "Against expectation", href: "#expectation" },
        ...(seeded ? [] : [{ label: "Biggest movers", href: "#movers" }]),
        { label: "Where this comes from", href: "#method" },
      ]} />

      {/* ------------------------------------------------- the season itself */}
      <section className="mb-12">
        <SectionHead
          id="race"
          title={seeded ? "Where every team starts" : "The season, week by week"}
          sub={seeded ? "Carried out of last season and pulled back toward the middle." : "One line per team. 1500 is the league average by construction."}
          more={
            "Elo moves after every game by the margin and by how surprising the result was, so a rating is a running answer to " +
            "“how good is this team right now” rather than a summary written at the end. Every league that ran in a season is rated in ONE pool, " +
            "so the 1946-49 AAFC and the 1960-69 AFL are rated against the NFL of their day; only the standings below are split. " +
            "A bye or a week after elimination inherits the previous rating and is drawn dashed, because it is a held value and not a fresh measurement."
          }
        />
        {seeded ? (
          <TableScroll className="rounded-xl border" style={CARD}>
            <table className="w-full text-xs" data-sticky-col="2">
              <thead>
                <tr className="text-[var(--text-dim)] text-left">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Team</th>
                  <th className="py-2 px-3 font-medium text-right">Rating</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Division</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t, i) => (
                  <tr key={t.name} className="border-t" style={BORD}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i + 1}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <TeamCell city={t.city} team={t.team} name={t.name} ident={ident[t.name]} />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <DataBar v={t.end} dp={0} label="Elo rating going into the season" />
                    </td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">{t.div}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
            <WeeklyEloChart teams={data.teams} season={season} colorByName={colorByName} regEndWeek={data.reg_end_week} />
          </div>
        )}
      </section>

      {/* --------------------------------------------------- week 1 pricing */}
      {wk1.length ? (
        <section className="mb-12">
          <SectionHead
            id="week1"
            title="Week 1, priced before a snap"
            sub="The chance the home side wins, from the two ratings and nothing else."
            more={
              "A win probability is not extra information on top of a rating, it IS the rating: the standard logistic on the gap between the two teams " +
              "plus a 65-point home advantage. That is why this can be published before the game rather than read off afterwards. " +
              "Only week 1 is priced. Week 2 depends on how week 1 goes, so those games carry no number rather than a guessed one."
            }
          />
          <TableScroll className="rounded-xl border" style={CARD}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-dim)] text-left">
                  <th className="py-2 px-3 font-medium">Game</th>
                  <th className="py-2 px-3 font-medium text-right">Home win</th>
                  <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Ratings</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {wk1.map((g) => (
                  <tr key={`${g.date}-${g.home}`} className="border-t" style={BORD}>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span className="text-[var(--text)]">{g.home}</span>
                      <span className="text-[var(--text-dim)]"> vs </span>
                      {g.away}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <DataBar v={g.p_home} dp={1} suffix="%" scale={100} label={`chance ${g.home} win at home`} />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>
                      {g.home_elo?.toFixed(0)} v {g.away_elo?.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)] tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}>{g.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : null}

      {/* ------------------------------------------------------- standings */}
      <section className="mb-12">
        <SectionHead
          id="standings"
          title="Standings"
          sub={
            data.leagues.length > 1
              ? `${data.leagues.join(" and ")} ran side by side; the ratings do not.`
              : "Record, points, rating and what the season came to, grouped however you want to read it."
          }
          more={
            (data.leagues.length > 1
              ? "The two leagues are shown apart because their tables were never one table. The ratings ARE one pool: a team is rated against everyone playing that year, which is the only way to ask how the leagues compared. "
              : "") +
            "The record is the final regular-season record. The strip on each row fills in from the left as a team went further: playoffs, division, best record in its conference, conference final, championship game, championship. " +
            "An asterisk on a record is the best record in the league, and a seed is the number a team carried into the playoffs. " +
            "Teams level on record are ordered by rating: the league's own tiebreakers are not in this workbook, so the order inside a tie is not authoritative. The division flag is."
          }
        />
        <SeasonStandings teams={standingsTeams} showHonours={showHonours} showSeeds={showSeeds} />
      </section>

      {/* --------------------------------------------------------- games */}
      {bestGames.length ? (
        <section className="mb-12">
          <SectionHead
            id="games"
            title={`The best games of ${season}`}
            sub="Ranked by Game Score, which nobody voted on."
            more={
              "Game Score is built from the two ratings going in, how close the result was, what was at stake and how far the winner was from being favourite, " +
              "so a tight upset in a Super Bowl scores above a blowout in week 3 without anyone deciding it should. The same measure ranks the all-time board on the NFL hub."
            }
          />
          <TableScroll className="rounded-xl border" style={CARD}>
            <table className="w-full text-xs" data-sticky-col="2">
              <thead>
                <tr className="text-[var(--text-dim)] text-left">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Game</th>
                  <th className="py-2 px-3 font-medium text-right">Score</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Round</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {bestGames.map((g, i) => {
                  const ws = getNflSlugByTeamName(`${g.winner_city} ${g.winner_team}`);
                  const ls = getNflSlugByTeamName(`${g.loser_city} ${g.loser_team}`);
                  const wl = ws ? logoUrlFor(ws) : null;
                  return (
                    <tr key={`${g.date}-${g.winner_team}`} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i + 1}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {wl ? <img src={wl} alt="" width={18} height={18} className="inline-block align-text-bottom mr-1.5 object-contain" style={{ width: 18, height: 18 }} loading="lazy" decoding="async" /> : null}
                        {ws ? (
                          <Link href={`/teams/nfl/${ws}`} className="text-[var(--accent)] hover:underline">{g.winner_team}</Link>
                        ) : g.winner_team}{" "}
                        <span className="tabular-nums text-[var(--text-dim)]" style={MONO}>
                          {g.winner_score}-{g.loser_score}
                        </span>{" "}
                        <span className="text-[var(--text-muted)]">
                          {g.is_tie ? "tied with" : "beat"}{" "}
                          {ls ? <Link href={`/teams/nfl/${ls}`} className="hover:text-[var(--accent)] hover:underline">{g.loser_team}</Link> : g.loser_team}
                        </span>
                        {g.ot ? <span className="ml-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">OT</span> : null}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <DataBar v={g.du} dp={2} label="game score" />
                      </td>
                      <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">{g.round}</td>
                      <td className="py-1.5 px-3 text-[var(--text-muted)] tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}>{g.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- movers */}
      {!seeded ? (
        <section className="mb-12">
          <SectionHead
            id="movers"
            title="Who the season changed its mind about"
            sub="Rating at the end, against the rating it started with."
            more="A team can gain a lot and still miss the playoffs, and a team can win its division while the model thinks less of it in January than it did in August. That gap is the season's real story and no final table contains it."
          />
          <TableScroll className="rounded-xl border" style={CARD}>
            <table className="w-full text-xs" data-sticky-col="2">
              <thead>
                <tr className="text-[var(--text-dim)] text-left">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Team</th>
                  <th className="py-2 px-3 font-medium text-right">Change</th>
                  <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Start</th>
                  <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">End</th>
                  <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Peak</th>
                </tr>
              </thead>
              <tbody>
                {movers.slice(0, 5).concat(movers.slice(-5)).map((m, i) => (
                  <tr key={m.t.name} className="border-t" style={BORD}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 5 ? i + 1 : ""}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <TeamCell city={m.t.city} team={m.t.team} name={m.t.name} ident={ident[m.t.name]} />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <DivergingBar v={m.delta} max={moversMax} dp={0} suffix="" label="Elo gained or lost across the season" />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{m.t.start.toFixed(0)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{m.t.end.toFixed(0)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{m.t.peak.e.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : null}

      {/* ------------------------------------------------- against expectation */}
      <section className="mb-12">
        <SectionHead
          id="expectation"
          title="What a model that had to say so beforehand made of it"
          sub="Every game of the season, priced before kick-off and scored afterwards."
          more={
            "The rating on this page is a description of what happened. Turning it into a probability BEFORE a game and then " +
            "grading that probability is a different and much harder claim, and it is the one the game log makes. " +
            "The comparison is against the closing betting line, which is the number to beat, and mostly it wins."
          }
        />
        <ExpectationPreview season={season} />
      </section>

      {/* ---------------------------------------------------------- method */}
      <section className="mb-6">
        <SectionHead id="method" title="Where these numbers come from" sub="Enough to disbelieve this page on purpose rather than by accident." />
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] space-y-3 max-w-4xl" style={CARD}>
          <p>
            Ratings are Neil Paine&rsquo;s NFL Elo, carried in this site&rsquo;s own NFL workbook and read here one
            season at a time: {data.meta.team_weeks.toLocaleString()} team-weeks covering{" "}
            {data.meta.seasons[0]} to {data.meta.seasons[1]}, with a rating and a league rank on every one.
            Home advantage is worth {data.meta.hfa_elo} rating points, which is the constant the win
            probabilities on this page use.
          </p>
          {data.dropped_weeks.length ? (
            <p>
              <span className="text-[var(--text)]">Not everything in this season is shown.</span>{" "}
              {data.dropped_weeks.length} week{data.dropped_weeks.length === 1 ? " was" : "s were"} held back
              because every team shared one rating in {data.dropped_weeks.length === 1 ? "it" : "them"}, which
              carries no information whatever the number is. A rating is published only where the teams differ.
            </p>
          ) : null}
          {!data.complete ? (
            <p>
              <span className="text-[var(--text)]">There is no best-games board for {season} yet.</span>{" "}
              Game Score ranks a game against a finished season, so a board built in
              week three would be ranking three weeks of football. It appears once the
              championship is played and the workbook records a champion.
            </p>
          ) : null}
          <p>
            Nothing here is a forecast. The model was not held out from the seasons it rates, so read it as a
            description of what happened rather than a prediction of what will.{" "}
            <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline">Against Expectation</Link>{" "}
            is where the same ledger is scored against the betting market, and it loses.
          </p>
        </div>
      </section>
    </main>
  );
}
