import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Suspense } from "react";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import SportsExplorer, { type TeamMarker } from "./SportsExplorer";
import { leagueStatusFor, LeagueStatusTag } from "@/lib/leagueStatus";

export const dynamicParams = false;

const PAGE_PATH = "/sports";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Sports";
const PAGE_DESCRIPTION =
  "Every Major League team across every sport, on one map. Filter by sport, league, or country, then click through to per-franchise pages.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

type LeagueCard = {
  league: string;
  label: string;
  sport: string;
  status: "live" | "coming";
  page: string | null;
  team_count: number;
};

type Summary = {
  total_markers: number;
  major_markers: number;
  other_markers: number;
  by_sport: Record<string, number>;
  by_league_top: Record<string, number>;
  by_country_top: Record<string, number>;
  markers_with_team_page: number;
  league_cards: LeagueCard[];
};

type DeepDive = { href: string; title: string; tag: string; desc: string };

function loadJson<T>(rel: string): T {
  const file = path.join(process.cwd(), "public", "data", "sports", rel);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

// Cross-sport feature pages that sit above the league directory. These cut
// across leagues rather than belonging to any one of them.
const DEEP_DIVES: DeepDive[] = [
  {
    href: "/sports/valuations",
    title: "Team Valuations",
    tag: "Cross-sport",
    desc: "Franchise values across the NFL, NBA, MLB, NHL and global soccer, on one sortable board.",
  },
  {
    href: "/top-teams",
    title: "The Team That Wins the City",
    tag: "Every metro",
    desc: "One crest per metro: the club whose disappearance would change what the metro is, not the one with the most trophies.",
  },
];

// Editorial overrides for the league directory: drop the Big 5 country cards
// (Club Football covers them), inject the live Football/IPL/Women's/WNBA hubs,
// and list the two college hubs as coming soon.
const REMOVED_LEAGUE_KEYS = new Set(["England", "Spain", "Italy", "Germany", "France", "IPL", "AFL", "NRL", "CFL", "NWSL", "WSL"]);
const INJECTED_LIVE_CARDS: LeagueCard[] = [
  {
    league: "ClubFootball",
    label: "Club Football",
    sport: "Football",
    status: "live",
    page: "/teams/football",
    team_count: 0,
  },
  {
    league: "InternationalFootball",
    label: "International Football",
    sport: "Football",
    status: "live",
    page: "/teams/national",
    team_count: 0,
  },
  {
    league: "IPL",
    label: "IPL",
    sport: "Cricket",
    status: "live",
    page: "/teams/ipl",
    team_count: 0,
  },
  {
    league: "WomensClubFootball",
    label: "Women's Football",
    sport: "Football",
    status: "live",
    page: "/teams/wfootball",
    team_count: 0,
  },
  {
    league: "WNBA",
    label: "WNBA",
    sport: "Basketball",
    status: "live",
    page: "/teams/wnba",
    team_count: 0,
  },
];
const INJECTED_COMING_CARDS: LeagueCard[] = [
  {
    league: "CFB",
    label: "College Football",
    sport: "American Football",
    status: "coming",
    page: null,
    team_count: 0,
  },
  {
    league: "CBB",
    label: "Men's College Basketball",
    sport: "Basketball",
    status: "coming",
    page: null,
    team_count: 0,
  },
];

export default function SportsPage() {
  const teams = loadJson<TeamMarker[]>("all-teams.json");
  const summary = loadJson<Summary>("league-summary.json");

  const baseCards = summary.league_cards.filter((c) => !REMOVED_LEAGUE_KEYS.has(c.league));
  const liveCards = baseCards.filter((c) => c.status === "live");
  const comingCards = baseCards.filter((c) => c.status === "coming");
  const composedCards: LeagueCard[] = [
    ...liveCards,
    ...INJECTED_LIVE_CARDS,
    ...comingCards,
    ...INJECTED_COMING_CARDS,
  ];
  const liveCount = composedCards.filter((c) => c.status === "live").length;
  const comingCount = composedCards.filter((c) => c.status === "coming").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hub header */}
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">All Sports</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Sports</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Cross-sport deep-dives, a directory of every tracked league, and an interactive map of every
          top-flight team across the world.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Deep-Dives", href: "#deep-dives" },
          { label: "League directory", href: "#league-directory" },
          { label: "Team map", href: "#map" },
        ]}
      />

      {/* Sports Deep-Dives */}
      <section id="deep-dives" className="mb-12">
        <h2 className="text-lg font-semibold mb-1">Sports Deep-Dives</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Cross-sport features that cut across leagues.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEEP_DIVES.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group block rounded-xl border p-5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="font-semibold text-lg tracking-tight group-hover:text-[var(--accent)]">{d.title}</div>
                <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">{d.tag}</span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">{d.desc}</p>
              <div className="mt-3 text-xs font-semibold text-[var(--accent)]">Explore &rarr;</div>
            </Link>
          ))}
        </div>
      </section>

      {/* League directory */}
      <section id="league-directory" className="mb-12">
        <h2 className="text-lg font-semibold mb-1">League directory</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Live cards link straight to the per-franchise pages. Coming-soon cards stay on this page until that league ships.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {composedCards.map((c) => {
            const isLive = c.status === "live" && c.page;
            const showTeamCount = c.team_count > 0;
            const inner = (
              <div
                className={`rounded-xl border p-4 h-full transition-colors ${
                  isLive ? "hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" : "opacity-65"
                }`}
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="font-semibold text-base tracking-tight">{c.label}</div>
                  {!isLive && (
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Soon</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{c.sport}</div>
                {isLive && (
                  <div className="mt-1.5">
                    <LeagueStatusTag status={leagueStatusFor(c.page) ?? { label: "Live", tone: "regular" }} />
                  </div>
                )}
                {showTeamCount && (
                  <div className="text-xs text-[var(--text-dim)] mt-1 tabular-nums">{c.team_count} teams</div>
                )}
              </div>
            );
            return isLive ? (
              <Link key={c.league} href={c.page!} className="block">{inner}</Link>
            ) : (
              <div key={c.league}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Team map */}
      <section id="map">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Every top-flight team, on one map</h2>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every top-flight team across the tracked sports and countries, on one map.
          Filter by sport, league, or country, or jump straight to a per-franchise page where one exists.
          Per-team pages are live for NFL, MLB, NBA, and NHL.
        </p>
        <p className="text-[var(--text-dim)] max-w-3xl text-xs mt-2">
          Rosters and divisions current as of Feb 2026. Level + division changes happen during each sport&apos;s offseason and are noted in <Link href="/updates" className="underline hover:text-[var(--accent)]">/updates</Link>.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4 mb-4">
          <div><strong className="text-[var(--text)] text-sm">{summary.major_markers.toLocaleString()}</strong> Major League · <strong className="text-[var(--text)] text-sm">{summary.other_markers.toLocaleString()}</strong> College & second flight</div>
          <div><strong className="text-[var(--text)] text-sm">{summary.markers_with_team_page}</strong> with per-franchise pages</div>
          <div><strong className="text-[var(--text)] text-sm">{liveCount}</strong> leagues live · {comingCount} coming</div>
        </div>

        <Suspense
          fallback={
            <div
              className="rounded-lg border h-[540px] flex items-center justify-center text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Loading explorer…
            </div>
          }
        >
          <SportsExplorer teams={teams} />
        </Suspense>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Data from <Link href="/methodology" className="hover:text-[var(--text-muted)]">MetroAreas.xlsx</Link> Team List and FootballClub_Data.
        Gold markers are the Major League scope; slate markers are NCAA Division I, FBS, and second-flight or international competitions.
      </p>
    </main>
  );
}
