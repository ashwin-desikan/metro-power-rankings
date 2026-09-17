import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import HubNav from "@/app/teams/HubNav";
import { SectionHead } from "@/app/_shared/SectionHead";
import { getNbaEloIndex } from "@/lib/nbaElo";
import {
  getFranchiseByCanonical, nbaLineColor, logoUrlFor, monogramFor,
  MONOGRAM_BY_SLUG, seasonLabel,
} from "@/lib/nba";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";

// The discovery surface for 80 season hubs, built to match
// /teams/nfl/season so the two sports read as one site rather than two
// projects (Ashwin, 2026-09-17: "keep the NBA and NFL looking pretty similar").
//
// 🔴 A DIRECTORY THAT IS ONLY A DIRECTORY IS A WASTED PAGE. The first build of
// this page spent its whole height on 80 chips and said nothing the season
// pages do not. The NFL index solved that: the browse list compresses to one
// chip row per decade, and the room that buys is spent on what only an
// all-seasons view can show. Here that is the belt, and the 28 seasons where
// the best team in the league did not win the title.
//
// 🔴 SEASONS ARE LABELLED THE WAY A READER SAYS THEM. The workbook stores the
// END year, so 2026 is the 2025-26 season. Every user-facing string goes
// through seasonLabel(); a bare "2026" on a sport that spans two calendar
// years is the same ambiguity that hid a preseason standings board for a month.

export const revalidate = 86400;

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

const PAGE_TITLE = "Every NBA season since 1947";
const PAGE_DESCRIPTION =
  "One hub per NBA season from 1946-47 to today, each showing every team's rating week by week, the table as it stood after any week, and who ended the year on top.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/teams/nba/season" },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, "/teams/nba/season"), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: `${BASE_URL}/teams/nba/season`,
    type: "website",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, "/teams/nba/season")],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default async function NbaSeasonsIndex() {
  const index = await getNbaEloIndex().catch(() => null);
  const rows = index?.seasons ?? [];
  if (!rows.length) return null;

  // Crest, link and club colour for every franchise this page names, resolved
  // once. logoUrlFor stats the filesystem, so it is not called per render.
  const slugOf: Record<string, string | null> = {};
  const colour: Record<string, string | null> = {};
  const named = new Set(
    rows.flatMap((r) => [r.top?.name, r.champion?.name]).filter(Boolean) as string[],
  );
  for (const nm of named) {
    const slug = getFranchiseByCanonical(nm)?.slug ?? null;
    slugOf[nm] = slug;
    colour[nm] = nbaLineColor(slug);
  }

  const decades = new Map<number, typeof rows>();
  for (const r of rows) {
    const d = Math.floor(r.season / 10) * 10;
    (decades.get(d) ?? decades.set(d, []).get(d)!).push(r);
  }

  // 🔴 THE COMPARISON IS ONLY LEGAL ON A FINISHED SEASON. A seeded season has
  // a top-rated team and no champion, which is not a disagreement, it is an
  // unplayed year.
  const withBoth = rows.filter((r) => r.complete && r.champion && r.top);
  const disagree = withBoth.filter((r) => r.champion!.name !== r.top!.name);
  const live = rows.filter((r) => r.status !== "final").map((r) => r.season);
  const latest = rows[rows.length - 1];
  const first = rows[0];

  const who = (x: { city: string | null; team: string | null; name: string } | null) =>
    x ? [x.city, x.team].filter(Boolean).join(" ") || x.name : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/nba" className="hover:underline">NBA</Link>{" / "}
        <span>Seasons</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          🏀 Every NBA season since 1947
        </h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          {rows.length} seasons, each with every team&rsquo;s rating week by week and the table as it
          stood after any week of that year. One model runs the whole way through, so a{" "}
          {seasonLabel(1962)} team and a {seasonLabel(latest.season)} team are measured the same way
          {live.length ? <> and {live.map(seasonLabel).join(", ")} is already seeded</> : null}.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          {index?.meta.team_weeks.toLocaleString()} team-weeks · {seasonLabel(first.season)}
          &ndash;{seasonLabel(latest.season)} · built {index?.meta.generated_at.slice(0, 10)}
        </div>
      </header>

      <HubNav items={[
        { label: "Browse a season", href: "#decades" },
        { label: "The best team, every year", href: "#belt" },
        { label: "When the best team lost", href: "#robbed" },
        { label: "NBA hub", href: "/teams/nba" },
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
              <div
                className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5"
                style={MONO}
              >
                {d}s
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* Newest first inside the decade as well as across them, so
                    the latest season of every decade sits at the row's left
                    edge and the eye reads the page as one descending column. */}
                {[...list].sort((a, b) => b.season - a.season).map((r) => (
                  <Link
                    key={r.season}
                    href={`/teams/nba/season/${r.season}`}
                    title={[
                      r.top ? `Top rated: ${who(r.top)} ${r.top.elo.toFixed(0)}` : null,
                      r.champion ? `Champion: ${who(r.champion)}` : r.complete ? null : "Not played yet",
                      r.leagues.length ? r.leagues.join(" + ") : null,
                    ].filter(Boolean).join(" · ")}
                    /* 🔴 44px ON A PHONE, 26px ON A DESKTOP. A season chip is a
                       standalone navigation link, so the tap-target rule binds:
                       80 of them at 26px is 80 misses. The compact chip is kept
                       where a pointer exists and grown where a thumb is. */
                    className="text-xs px-3 min-h-11 sm:min-h-0 sm:px-2.5 sm:py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5 tabular-nums"
                    style={CARD}
                  >
                    <span style={MONO}>{seasonLabel(r.season)}</span>
                    {r.status !== "final" ? (
                      <span
                        className="text-[9px] px-1 py-px rounded-full border"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        LIVE
                      </span>
                    ) : null}
                    {r.leagues.includes("BAA") ? (
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">BAA</span>
                    ) : null}
                  </Link>
                ))}
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
            "Highest rating at the end of the season, which is not the same as champion and disagrees " +
            `${disagree.length} times. Reading across, a colour that holds for four squares is a dynasty ` +
            "and a wall of different colours is a decade nobody owned. A franchise with no stored colour " +
            "keeps the neutral border rather than being assigned one."
          }
        />
        {/* 🔴 A WALL OF SQUARES, NOT A LINE CHART. A line of top ratings answers
            "how far ahead was the best team" and hides the thing a reader wants,
            which is WHO. One card per season, tinted with that club's own
            colour, so four Celtics squares in a row read as four Celtics
            squares in a row. */}
        <div className="flex flex-wrap gap-1.5">
          {rows.filter((r) => r.complete).map((r) => {
            const nm = r.top?.name;
            const col = nm ? colour[nm] : null;
            const short = r.top?.team ?? nm ?? null;
            const won = r.champion && r.top && r.champion.name === r.top.name;
            return (
              <Link
                key={r.season}
                href={`/teams/nba/season/${r.season}`}
                title={[
                  short ? `${seasonLabel(r.season)}: ${who(r.top)} ${r.top!.elo.toFixed(0)}` : seasonLabel(r.season),
                  r.champion ? (won ? "and won it" : `champion: ${who(r.champion)}`) : null,
                ].filter(Boolean).join(" · ")}
                className="inline-flex flex-col items-center rounded-md border px-2 py-1 text-center min-w-[68px] min-h-11 sm:min-h-0 justify-center transition hover:border-[var(--accent)]"
                style={{
                  borderColor: col ?? "var(--border)",
                  background: "var(--bg-card)",
                  boxShadow: col ? `inset 3px 0 0 ${col}` : undefined,
                }}
              >
                <span className="text-[9px] text-[var(--text-dim)] tabular-nums" style={MONO}>
                  {seasonLabel(r.season)}
                </span>
                <span
                  className="text-[11px] font-semibold leading-tight"
                  style={{ color: col ?? "var(--text-muted)" }}
                >
                  {short ?? "—"}
                  {won ? (
                    <span className="ml-0.5" style={{ color: "#D4AF37" }} title="won the title too">★</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">
          A star marks a season where the best-rated team also won the title. It happens in{" "}
          {withBoth.length - disagree.length} of {withBoth.length} finished seasons.
        </p>
      </section>

      {/* -------------------------------------------- when the best team lost */}
      <section className="mb-12">
        <SectionHead
          id="robbed"
          title="When the best team lost"
          sub={`${disagree.length} seasons ended with the title somewhere other than the top of the ratings.`}
          more={
            "The rating is where a team finished the season, so this is not hindsight about a bad night: " +
            "it is the league's best side over a whole year losing a short series. That is the sport " +
            "working as designed, and the list is what a seven-game round costs the better team."
          }
        />
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {[...disagree].reverse().map((r) => {
            const topCol = colour[r.top!.name];
            const champCol = colour[r.champion!.name];
            return (
              <li key={r.season}>
                <Link
                  href={`/teams/nba/season/${r.season}`}
                  className="flex items-center gap-2 rounded-lg border px-3 min-h-11 py-2 transition hover:border-[var(--accent)]"
                  style={CARD}
                >
                  <span
                    className="text-[11px] tabular-nums text-[var(--text-dim)] w-14 flex-shrink-0"
                    style={MONO}
                  >
                    {seasonLabel(r.season)}
                  </span>
                  <span className="min-w-0 text-xs leading-tight">
                    <span className="font-semibold" style={{ color: topCol ?? "var(--text)" }}>
                      {r.top!.team ?? r.top!.name}
                    </span>
                    <span className="text-[var(--text-dim)]"> rated top, </span>
                    <span className="font-semibold" style={{ color: champCol ?? "var(--text)" }}>
                      {r.champion!.team ?? r.champion!.name}
                    </span>
                    <span className="text-[var(--text-dim)]"> won it</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">Sources</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Weekly ratings, records and honours are maintained in the project&rsquo;s NBA workbook and
          refreshed when it is updated. The rating is an external series carried in the workbook, not
          computed here, so a week appears once the workbook has it.
        </p>
      </section>
    </main>
  );
}
