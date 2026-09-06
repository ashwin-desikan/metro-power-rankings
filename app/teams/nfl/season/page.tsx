import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getNflEloIndex } from "@/lib/nflElo";
import ExpectationChart from "./_shared/ExpectationChart";
import TeamCell, { type TeamIdent } from "./_shared/TeamCell";
import { getNflExpectation } from "@/lib/nflExpectation";
import {
  nflSlugForCanonical, nflLineColor, logoUrlFor, monogramFor, MONOGRAM_BY_SLUG,
} from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// The discovery surface for 107 season hubs. Without it /teams/nfl/season is a
// 404 and the only way to reach 1932 is to type it.
//
// 🔴 A DIRECTORY THAT IS ONLY A DIRECTORY IS A WASTED PAGE. The first build
// spent three screens on 107 cards carrying a team name apiece and said nothing
// the season pages do not. /teams/football/seasons is the idiom that works: the
// browse list compresses to one chip row per decade, and the room that buys is
// spent on what only a 107-season view can show - how high the ceiling has sat
// over time, and the 25 seasons where the best team in the league did not win.

export const revalidate = 86400;

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };

const PAGE_TITLE = "Every NFL season since 1920";
const PAGE_DESCRIPTION =
  "One hub per NFL season from 1920 to today, each showing every team's Elo rating week by week, the final standings and the biggest movers, on a single model.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/teams/nfl/season" },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: `${BASE_URL}/teams/nfl/season`,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default async function NflSeasonsIndex() {
  const [index, exp] = await Promise.all([
    getNflEloIndex().catch(() => null),
    getNflExpectation().catch(() => null),
  ]);
  const rows = index?.seasons ?? [];
  if (!rows.length) return null;

  // Crest, link and club colour for every franchise this page names, resolved
  // once. logoUrlFor stats the filesystem, so it is not called per render.
  const ident: Record<string, TeamIdent> = {};
  const colour: Record<string, string | null> = {};
  for (const nm of new Set(rows.flatMap((r) => [r.top?.name, r.champion?.name]).filter(Boolean) as string[])) {
    const slug = nflSlugForCanonical(nm);
    ident[nm] = {
      slug,
      logo: slug ? logoUrlFor(slug) : null,
      mono: slug && MONOGRAM_BY_SLUG[slug] ? monogramFor(slug) : null,
    };
    colour[nm] = nflLineColor(slug);
  }

  const decades = new Map<number, typeof rows>();
  for (const r of rows) {
    const d = Math.floor(r.season / 10) * 10;
    (decades.get(d) ?? decades.set(d, []).get(d)!).push(r);
  }
  const multi = rows.filter((r) => r.leagues.length > 1);

  // 🔴 THE COMPARISON IS ONLY LEGAL ON A FINISHED SEASON. A seeded season has a
  // top-rated team and no champion, which is not a disagreement, it is an
  // unplayed year.
  const disagree = rows.filter(
    (r) => r.complete && r.champion && r.top && r.champion.name !== r.top.name,
  );
  const agreed = rows.filter((r) => r.complete && r.champion && r.top).length;
  const live = rows.filter((r) => r.status !== "final").map((r) => r.season);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/nfl" className="hover:underline">NFL</Link>{" / "}
        <span>Seasons</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">🏈 Every NFL season since 1920</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          {rows.length} seasons, each with every team&rsquo;s rating week by week, its final standings and its
          best games. One model runs the whole way through, so a 1925 team and a 2025 team are measured the
          same way{live.length ? <> and {live.join(", ")} is already seeded</> : null}.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          {index?.meta.team_weeks.toLocaleString()} team-weeks · {rows[0].season}–{rows[rows.length - 1].season} · built {index?.meta.generated_at.slice(0, 10)}
        </div>
      </header>

      <HubNav items={[
        { label: "Browse a season", href: "#decades" },
        { label: "The best team, every year", href: "#belt" },
        { label: "Against expectation", href: "#expectation" },
        { label: "When the best team lost", href: "#robbed" },
        ...(multi.length ? [{ label: "Two leagues at once", href: "#rivals" }] : []),
        { label: "NFL hub", href: "/teams/nfl" },
      ]} />

      {/* ------------------------------------------------------ browse */}
      <section className="mb-12">
        <SectionHead
          id="decades"
          title="Browse a season"
          sub={`${rows.length} seasons, one hub each. Hover a year for who ended it on top.`}
        />
        <div className="space-y-2.5">
          {[...decades.entries()].sort((a, b) => b[0] - a[0]).map(([d, list]) => (
            <div key={d} className="flex items-baseline gap-3">
              <div className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5" style={MONO}>{d}s</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((r) => {
                  const who = r.top ? [r.top.city, r.top.team].filter(Boolean).join(" ") || r.top.name : null;
                  const champ = r.champion ? [r.champion.city, r.champion.team].filter(Boolean).join(" ") : null;
                  return (
                    <Link
                      key={r.season}
                      href={`/teams/nfl/season/${r.season}`}
                      title={[
                        who ? `Top rated: ${who} ${r.top!.elo.toFixed(0)}` : null,
                        champ ? `Champion: ${champ}` : r.complete ? null : "Not played yet",
                        r.leagues.length > 1 ? r.leagues.join(" + ") : null,
                      ].filter(Boolean).join(" · ")}
                      /* 🔴 44px ON A PHONE, 26px ON A DESKTOP. A season chip is a
                         standalone navigation link, so §6's tap-target rule binds:
                         107 of them at 26px is 107 misses. The compact chip is kept
                         where a pointer exists and grown where a thumb does. */
                      className="text-xs px-3 min-h-11 sm:min-h-0 sm:px-2.5 sm:py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5 tabular-nums"
                      style={CARD}
                    >
                      <span style={MONO}>{r.season}</span>
                      {r.status !== "final" ? (
                        <span className="text-[9px] px-1 py-px rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>LIVE</span>
                      ) : null}
                      {r.leagues.length > 1 ? (
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">2 lgs</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- the belt */}
      <section className="mb-12">
        <SectionHead
          id="belt"
          title="The belt: the best team in the league, season by season"
          sub="One square per season, in that team's own colour. Runs of dominance are the point."
          more={
            "Highest rating at the end of the season, which is not the same as champion and disagrees 25 times. " +
            "Reading across, a colour that holds for four squares is a dynasty and a wall of different colours is a decade nobody owned. " +
            "A franchise with no stored colour keeps the neutral border rather than being assigned one."
          }
        />
        {/* 🔴 A WALL OF SQUARES, NOT A LINE CHART. The first build put the top
            rating on a 107-point line, which answers "how far ahead was the best
            team" and hides the thing a reader actually wants, which is WHO. The
            club-football belt solves it: one card per season carrying the year
            and the club, tinted with the club's own colour, so four Packers
            squares in a row read as four Packers squares in a row. */}
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => {
            const nm = r.top?.name;
            const col = nm ? colour[nm] : null;
            const short = r.top?.team ?? nm ?? null;
            const won = r.champion && r.top && r.champion.name === r.top.name;
            return (
              <Link
                key={r.season}
                href={`/teams/nfl/season/${r.season}`}
                title={[
                  short ? `${r.season}: ${[r.top?.city, r.top?.team].filter(Boolean).join(" ") || short} ${r.top!.elo.toFixed(0)}` : String(r.season),
                  r.champion ? (won ? "and won it" : `champion: ${[r.champion.city, r.champion.team].filter(Boolean).join(" ")}`) : (r.complete ? null : "not played yet"),
                ].filter(Boolean).join(" · ")}
                className="inline-flex flex-col items-center rounded-md border px-2 py-1 text-center min-w-[68px] min-h-11 sm:min-h-0 justify-center transition hover:border-[var(--accent)]"
                style={{
                  borderColor: col ?? "var(--border)",
                  background: "var(--bg-card)",
                  boxShadow: col ? `inset 3px 0 0 ${col}` : undefined,
                }}
              >
                <span className="text-[9px] text-[var(--text-dim)] tabular-nums" style={MONO}>{r.season}</span>
                <span className="text-[11px] font-semibold leading-tight" style={{ color: col ?? "var(--text-muted)" }}>
                  {short ?? "—"}
                  {won ? <span className="ml-0.5" style={{ color: "#D4AF37" }} title="won the championship too">★</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">
          A star marks a season where the best-rated team also won the championship. It happens in{" "}
          {agreed - disagree.length} of {agreed} finished seasons.
        </p>
      </section>

      {/* ------------------------------------------------- against expectation */}
      {exp?.seasons?.length ? (
        <section className="mb-12">
          <SectionHead
            id="expectation"
            title="Against expectation, a century of it"
            sub="Every game priced before kick-off, and scored afterwards against the closing line."
            more={
              "Brier is the squared error of a probability: give a team 0.8 and it wins, you are charged 0.04; give it 0.8 and it loses, you are charged 0.64. " +
              "Lower is better, so this chart is drawn upside down and a higher line is a better forecast. " +
              "The market is the number to beat and mostly it wins, which is the honest headline. Every season has its own priced game log."
            }
          />
          <div className="rounded-xl border p-4 sm:p-5 min-w-0 mb-3" style={CARD}>
            <ExpectationChart rows={exp.seasons} />
          </div>
          {exp.upsets?.length ? (
            <>
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5" style={MONO}>
                The results a century of Elo got most wrong
              </div>
              <TableScroll className="rounded-xl border" style={CARD}>
                <table className="w-full text-xs" data-sticky-col="1">
                  <thead>
                    <tr className="text-[var(--text-dim)] text-left">
                      <th className="py-2 px-3 font-medium">Season</th>
                      <th className="py-2 px-3 font-medium">Winner</th>
                      <th className="py-2 px-3 font-medium">Beat</th>
                      <th className="py-2 px-3 font-medium text-right">Given</th>
                      <th className="py-2 px-3 font-medium hidden sm:table-cell">Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.upsets.slice(0, 8).map((u) => (
                      <tr key={u.game_id} className="border-t" style={BORD}>
                        <td className="py-1.5 px-3 tabular-nums" style={MONO}>
                          <Link href={`/teams/nfl/season/${u.season}`} className="text-[var(--accent)] hover:underline">{u.season}</Link>
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          <TeamCell name={u.winner} team={u.winner} size={18}
                            ident={{ slug: u.winner_slug, logo: u.winner_slug ? logoUrlFor(u.winner_slug) : null,
                              mono: u.winner_slug && MONOGRAM_BY_SLUG[u.winner_slug] ? monogramFor(u.winner_slug) : null }} />
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                          <TeamCell name={u.loser} team={u.loser} size={18}
                            ident={{ slug: u.loser_slug, logo: u.loser_slug ? logoUrlFor(u.loser_slug) : null,
                              mono: u.loser_slug && MONOGRAM_BY_SLUG[u.loser_slug] ? monogramFor(u.loser_slug) : null }} />
                          {u.score ? <span className="ml-2 tabular-nums text-[var(--text-dim)]" style={MONO}>{u.score}</span> : null}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{(u.p_winner * 100).toFixed(0)}%</td>
                        <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">
                          {u.playoff ? `${u.round ?? "playoff"} · ` : ""}{u.metro ?? u.venue ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </>
          ) : null}
          <p className="mt-2 text-xs text-[var(--text-dim)]">
            The full method, the market comparison and the metro rollups are on{" "}
            <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline">Against Expectation</Link>.
            Each season&rsquo;s own priced game log is linked from its season page.
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------- champion vs best */}
      <section className="mb-12">
        <SectionHead
          id="robbed"
          title="When the best team did not win"
          sub={`${disagree.length} of ${agreed} finished seasons ended with the championship somewhere other than the top of the ratings.`}
          more={
            "The model does not know who won a title; it only knows results, margins and who they came against. So a gap between the " +
            "best-rated team and the champion is not an error in either direction. It is the sport being a knockout at the end of a " +
            "league, which is the whole reason anyone watches the end of it."
          }
        />
        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-xs" data-sticky-col="1">
            <thead>
              <tr className="text-[var(--text-dim)] text-left">
                <th className="py-2 px-3 font-medium">Season</th>
                <th className="py-2 px-3 font-medium">Highest rated</th>
                <th className="py-2 px-3 font-medium text-right">Rating</th>
                <th className="py-2 px-3 font-medium">Champion</th>
              </tr>
            </thead>
            <tbody>
              {disagree.slice().reverse().map((r) => (
                <tr key={r.season} className="border-t" style={BORD}>
                  <td className="py-1.5 px-3 tabular-nums" style={MONO}>
                    <Link href={`/teams/nfl/season/${r.season}`} className="text-[var(--accent)] hover:underline">{r.season}</Link>
                  </td>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <TeamCell city={r.top!.city} team={r.top!.team} name={r.top!.name} ident={ident[r.top!.name]} size={18} />
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{r.top!.elo.toFixed(0)}</td>
                  <td className="py-1.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                    <TeamCell city={r.champion!.city} team={r.champion!.team} name={r.champion!.name} ident={ident[r.champion!.name]} size={18} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {multi.length ? (
        <section className="mb-6">
          <SectionHead
            id="rivals"
            title="The years two leagues ran at once"
            sub="Rated in one pool, so the comparison is finally possible."
            more="The AAFC and the AFL each played alongside the NFL and each had its own table. Nobody could say how the leagues compared, because nobody rated them together. These seasons do."
          />
          <p className="text-sm text-[var(--text-muted)] max-w-3xl">
            {multi.map((r, i) => (
              <span key={r.season}>
                {i > 0 ? ", " : ""}
                <Link href={`/teams/nfl/season/${r.season}`} className="text-[var(--accent)] hover:underline tabular-nums" style={MONO}>{r.season}</Link>
              </span>
            ))}
            . Every team in those years is rated against every other, whichever league it played in.
          </p>
        </section>
      ) : null}

      {/* -------------------------------------------------------- method */}
      <section className="mb-6">
        <SectionHead id="method" title="Where these numbers come from" sub="Enough to disbelieve this page on purpose rather than by accident." />
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] space-y-3 max-w-4xl" style={CARD}>
          <p>
            Ratings are Neil Paine&rsquo;s NFL Elo, carried in this site&rsquo;s own NFL workbook:{" "}
            {index?.meta.team_weeks.toLocaleString()} team-weeks across {rows.length} seasons, every one with a
            rating and a league rank. Championships and year-end honours come from the same workbook&rsquo;s
            year-by-year record, not from the ratings.
          </p>
          <p>
            Every league that ran in a season is rated in ONE pool, so the 1946-49 AAFC and the 1960-69 AFL are
            rated against the NFL of their day. Only the standings on a season page are split by league.
          </p>
          <p>
            Nothing here is a forecast. The model was not held out from the seasons it rates, so read it as a
            description of what happened rather than a prediction of what will.{" "}
            <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline">Against Expectation</Link>{" "}
            is where the same ledger is scored against the betting market, and it loses. Built{" "}
            {index?.meta.generated_at.slice(0, 10)}.
          </p>
        </div>
      </section>
    </main>
  );
}
