import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getNflEloIndex } from "@/lib/nflElo";
import BestTeamChart from "./_shared/BestTeamChart";
import { nflSlugForCanonical } from "@/lib/nfl";
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
  const index = await getNflEloIndex().catch(() => null);
  const rows = index?.seasons ?? [];
  if (!rows.length) return null;

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
        { label: "The best team, every year", href: "#ceiling" },
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

      {/* ----------------------------------------------------- the ceiling */}
      <section className="mb-12">
        <SectionHead
          id="ceiling"
          title="The best team in the league, every season"
          sub="How far the top of the league has sat above an average team, 1920 to today."
          more={
            "Elo is centred on 1500 in every era by construction, so this line is not measuring inflation: it is measuring how far " +
            "one team was allowed to get ahead of the field. Small leagues with uneven schedules let a team run further, which is why " +
            "the 1920s sit high; a 32-team league with a common draft and a salary cap pulls the ceiling down toward the middle."
          }
        />
        <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
          <BestTeamChart rows={rows} />
        </div>
      </section>

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
              {disagree.slice().reverse().map((r) => {
                const ts = nflSlugForCanonical(r.top!.name);
                const cs = nflSlugForCanonical(r.champion!.name);
                const who = [r.top!.city, r.top!.team].filter(Boolean).join(" ") || r.top!.name;
                const champ = [r.champion!.city, r.champion!.team].filter(Boolean).join(" ") || r.champion!.name;
                return (
                  <tr key={r.season} className="border-t" style={BORD}>
                    <td className="py-1.5 px-3 tabular-nums" style={MONO}>
                      <Link href={`/teams/nfl/season/${r.season}`} className="text-[var(--accent)] hover:underline">{r.season}</Link>
                    </td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      {ts ? <Link href={`/teams/nfl/${ts}`} className="hover:text-[var(--accent)] hover:underline">{who}</Link> : who}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{r.top!.elo.toFixed(0)}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                      {cs ? <Link href={`/teams/nfl/${cs}`} className="hover:text-[var(--accent)] hover:underline">{champ}</Link> : champ}
                    </td>
                  </tr>
                );
              })}
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
