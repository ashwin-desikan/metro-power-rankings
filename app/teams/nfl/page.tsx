import type { Metadata } from "next";
import Link from "next/link";
import { getAllFranchises, getChampionshipAppearances, getHistoricalFranchises, getTopGamesAllTime, getTopGamesByDecade, logoUrlFor, monogramFor, withStadiumLocations, withTeamSlugs, defunctSlug } from "@/lib/nfl";
import TopGamesTable from "./TopGamesTable";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import NflStandings from "./NflStandings";
import HubNav from "@/app/teams/HubNav";
import { HubHero } from "@/app/teams/_shared/HubHero";
import { sportGlyph } from "@/app/teams/_shared/SportIcon";
import { Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import EloPowerRankings from "./EloPowerRankings";
import { getNflEloIndex } from "@/lib/nflElo";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nfl";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NFL franchises";
const PAGE_DESCRIPTION =
  "All 32 active NFL franchises, ranked by championships won across the NFL, AAFC, AFL, and Super Bowl era. Founded year, current city, host metro, and all-time record per franchise.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default async function NflIndexPage() {
  const franchises = getAllFranchises();
  // Pre-sorted by champs desc, then win pct desc, in the ETL.
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const champAppMap = Object.fromEntries(
    franchises.map(f => [f.slug, getChampionshipAppearances(f.canonical).length])
  );
  const defunct = getHistoricalFranchises();

  // The Elo spine is what the hero counts from, because it is the only thing on
  // the page that knows how many seasons there are.
  const index = await getNflEloIndex().catch(() => null);
  const seasons = index?.seasons ?? [];
  const live = seasons[seasons.length - 1] ?? null;
  const firstSeason = seasons[0]?.season ?? 1920;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>NFL</span>
      </nav>

      {/* 🔴 THE HERO IS THE SITE'S HERO, NOT A SECOND ONE. This page opened with
          a paragraph, a row of loose statistics and six links that printed their
          own URLs at the reader. Every one of those links is now either a card
          with a reason to click it or an entry in the tab row below, and the
          header uses the same banded HubHero every football hub uses. */}
      <HubHero
        eyebrow="National Football League"
        icon={sportGlyph("nfl")}
        title={<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">NFL</h1>}
        subtitle={
          <>Every franchise, every season back to {firstSeason}, and one rating that runs the whole way
            through, so a 1925 team and a {live?.season ?? "2026"} team are measured the same way.</>
        }
        cta={
          <a
            href="/play/nfl-rules-lab.html"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] flex-shrink-0"
            style={{ background: "var(--bg-card-hover)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            New to the NFL? Rules Lab &rarr;
          </a>
        }
      >
        {live ? (
          <Link
            href={`/teams/nfl/season/${live.season}`}
            className="block rounded-xl border-2 p-4 transition hover:brightness-110"
            style={{ background: "var(--bg-card-hover)", borderColor: "var(--accent)" }}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                    {live.status === "final" ? "Final" : "Live"}
                  </span>
                  <span className="text-lg font-semibold">The {live.season} season</span>
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
                  {live.status === "final"
                    ? "Every team's rating week by week, the final standings and the best games of the year."
                    : `Every team's rating week by week as it happens, with next week's games priced before they are played.`}
                  {live.top ? <> Top rated right now: {[live.top.city, live.top.team].filter(Boolean).join(" ") || live.top.name}.</> : null}
                </p>
              </div>
              <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">Open the season hub &rarr;</span>
            </div>
          </Link>
        ) : null}

        <Link
          href="/teams/nfl/season"
          className="block rounded-xl border p-3 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold">
              Season archive
              <span className="font-normal text-[var(--text-muted)]">
                {" "}&middot; all {seasons.length || 107} seasons since {firstSeason}, and the 25 years the best team did not win
              </span>
            </span>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">Browse every season &rarr;</span>
          </div>
        </Link>

        {/* The four layers, as stat-cards that double as section nav - the numbers ARE the pitch. */}
        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
          {[
            { href: "#now", emoji: "\u{1F4C8}", stat: String(seasons.length || 107), label: "seasons rated", blurb: `One Elo model from ${firstSeason} to today, ${(index?.meta.team_weeks ?? 48636).toLocaleString("en-US")} team-weeks of it.` },
            { href: "#all-time", emoji: "\u{1F3C6}", stat: String(totalChamps), label: "titles won", blurb: `Across the NFL, AAFC, AFL and Super Bowl era, shared by ${withChamps} of the ${franchises.length} franchises.` },
            { href: "#map", emoji: "\u{1F5FA}\uFE0F", stat: String(franchises.length), label: "active franchises", blurb: "Pinned where they play, with every city each one has left behind." },
            { href: "/teams/nfl/historical", emoji: "\u{1F47B}", stat: String(defunct.length), label: "franchises gone", blurb: "The Akron Pros to the Baltimore Colts: every club that stopped." },
          ].map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="rounded-xl border p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-lg leading-none" aria-hidden>{c.emoji}</span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{c.stat}</span>
              </div>
              <div className="text-xs font-semibold mt-0.5">{c.label}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{c.blurb}</div>
            </a>
          ))}
        </div>
      </HubHero>

      <HubNav
        items={[
          { label: "Rankings & standings", href: "#now" },
          { label: "Seasons since 1920", href: "/teams/nfl/season" },
          { label: "Map", href: "#map" },
          { label: "All-time table", href: "#all-time" },
          { label: "Top games", href: "#top-games" },
          { label: "Against expectation", href: "/sports/expectation" },
          { label: "International", href: "/teams/nfl/international" },
          { label: "Predictions", href: "/predictions/nfl" },
        ]}
      />

      {/* 🔴 THE TWO BOARDS ANSWER THE SAME QUESTION DIFFERENTLY, SO THEY SIT
          SIDE BY SIDE. Stacked, a reader had to scroll a screen between "who is
          rated highest" and "who is actually winning", which is exactly the
          comparison worth making: the standings are what happened, the ratings
          are how it happened, and the interesting teams are the ones where the
          two disagree. They stack below xl, where there is no room for two. */}
      <section className="mb-10">
        <SectionHead
          id="now"
          title={`The ${live?.season ?? new Date().getFullYear()} season, two ways`}
          sub="What the table says, and what the model says. The gap between them is the story."
          more={
            "Standings are the record: live from ESPN, refreshed hourly, with our own simulation of the rest of the schedule " +
            "attached as playoff and title odds. The Elo board is the rating, which moves on margin and on who the result came " +
            "against rather than on wins alone. A team high in one and low in the other is either being carried by its schedule " +
            "or being wasted by it, and that is usually the most interesting team in the league."
          }
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">Elo power rankings</h3>
            <EloPowerRankings columns={2} bare />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">Current standings</h3>
            <Disclosure
              title={<span className="text-sm font-medium text-[var(--text-muted)]">Show the eight divisions</span>}
              meta="live from ESPN"
              /* 🔴 OPEN WHERE THE COMPARISON FITS, ONE TAP AWAY WHERE IT DOES
                 NOT. Side by side on a desktop the two boards ARE the feature,
                 so the standings are expanded and toggle-free there. Stacked on
                 a phone they turned the hub into 9.4 screens, so the phone gets
                 the control instead. §2, exactly. */
              desktopOpen
            >
              <div className="p-3">
                <NflStandings columns={2} bare />
              </div>
            </Disclosure>
          </div>
        </div>
      </section>

      {/* 32-team sortable table. Logo and monogram maps are computed
          server-side so the client component never has to touch the
          filesystem; sorting state lives entirely in the client. */}
      <div id="map">
        <LeagueMap franchises={franchises} />
      </div>

      <div id="all-time">
        <FranchiseTable
          franchises={franchises}
          historical={getHistoricalFranchises()}
          logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
          monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
          champAppMap={champAppMap}
          defunctSlugMap={Object.fromEntries(getHistoricalFranchises().map(h => [h.canonical, defunctSlug(h)]))}
        />
      </div>

      <div id="top-games">
        <TopGamesTable
          allTime={withTeamSlugs(withStadiumLocations(getTopGamesAllTime()))}
          byDecade={Object.fromEntries(
            Object.entries(getTopGamesByDecade()).map(([k, v]) => [
              k,
              withTeamSlugs(withStadiumLocations(v)),
            ])
          )}
        />
      </div>

      <section className="mb-6 mt-10">
        <SectionHead id="method" title="Where these numbers come from" sub="Enough to disbelieve this page on purpose rather than by accident." />
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] space-y-3 max-w-4xl"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <p>
            Franchise records, championships, stadiums and awards come from this site&rsquo;s own NFL workbook,
            curated by hand over many years. Ratings are Neil Paine&rsquo;s NFL Elo carried in the same workbook:{" "}
            {(index?.meta.team_weeks ?? 48636).toLocaleString("en-US")} team-weeks from {firstSeason} to{" "}
            {live?.season ?? 2026}, one rating and one league rank on every week.
          </p>
          <p>
            Current standings are live from ESPN&rsquo;s public feed and refresh hourly; everything else refreshes
            when the workbook does{index ? <>, last on {index.meta.generated_at.slice(0, 10)}</> : null}. Full method on the{" "}
            <a href="/methodology" className="text-[var(--accent)] hover:underline">methodology page</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
