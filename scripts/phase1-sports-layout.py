#!/usr/bin/env python3
"""
Phase 1 — Sports hub map-forward reorg.

Run from the repo root (the folder that contains app/sports/page.tsx):

    python phase1-sports-layout.py

What it does:
  1. Creates app/sports/SportsConsole.tsx (sticky sidebar: hub links + deep-dives).
  2. Rewrites app/sports/page.tsx into the map-forward, two-pane layout
     (map in 8 cols, SportsConsole in 4 cols, full league directory below).

Safety:
  - Asserts a set of unique anchors exist in the current page.tsx; aborts if any
    is missing (your working copy has drifted -- send me the current file).
  - Aborts if it looks already applied (SportsConsole import present).
  - Backs up both files to *.phase1.bak before writing.

Nothing is committed. Run your TS type check after, then preview locally.
"""

import os
import sys
import shutil

PAGE = os.path.join("app", "sports", "page.tsx")
CONSOLE = os.path.join("app", "sports", "SportsConsole.tsx")

ANCHORS = [
    'import SportsExplorer, { type TeamMarker } from "./SportsExplorer";',
    "const DEEP_DIVES: DeepDive[] = [",
    '<section id="deep-dives" className="mb-12">',
    '<section id="league-directory" className="mb-12">',
    '<section id="map">',
    "export default function SportsPage() {",
    '{ label: "Deep-Dives", href: "#deep-dives" },',
]

CONSOLE_TSX = r'''import Link from "next/link";

// Sticky sidebar for /sports, the cross-sport analogue of app/HomeSidebar.
// Lives beside the map at lg+ (col-span-4) and stacks below on mobile.
// Two blocks plus a CTA foot:
//   1. Jump to a hub  - every live league hub, one click away.
//   2. Deep-dives     - the cross-sport feature pages.
//   3. Methodology / What's new CTAs.
// Server component. Data is passed in from page.tsx (no new fetch).

export type ConsoleHub = { label: string; sport: string; href: string };
export type ConsoleDeepDive = { href: string; title: string; tag: string; desc: string };

export default function SportsConsole({
  hubs,
  deepDives,
}: {
  hubs: ConsoleHub[];
  deepDives: ConsoleDeepDive[];
}) {
  return (
    <aside
      id="console"
      className="space-y-5 lg:sticky lg:top-20 scroll-mt-20"
      style={{ alignSelf: "start" }}
    >
      <Section title="Jump to a hub">
        <div className="grid grid-cols-1 gap-2">
          {hubs.map((h) => (
            <Link
              key={h.href}
              href={h.href}
              className="group block rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border)",
                borderLeftWidth: "3px",
                borderLeftColor: "var(--accent)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[10px] tracking-widest uppercase"
                    style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {h.sport}
                  </div>
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                    {h.label}
                  </div>
                </div>
                <span
                  className="text-xs transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--text-muted)" }}
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Deep-dives">
        <ul className="space-y-2">
          {deepDives.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="group block rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div
                    className="text-sm font-medium group-hover:text-[var(--accent)]"
                    style={{ color: "var(--text)" }}
                  >
                    {d.title}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
                    {d.tag}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <Link
          href="/methodology"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Methodology &rarr;
        </Link>
        <Link
          href="/updates"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          What&apos;s new &rarr;
        </Link>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] tracking-widest uppercase mb-2"
        style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
'''

PAGE_TSX = r'''import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Suspense } from "react";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import SportsExplorer, { type TeamMarker } from "./SportsExplorer";
import SportsConsole from "./SportsConsole";
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
    href: "/sports/geography-of-erasure",
    title: "The Geography of Erasure",
    tag: "Ghost franchises",
    desc: "The champions the map forgot: dominant clubs erased when the metro behind them was outgrown by the modern league.",
  },
  {
    href: "/sports/games",
    title: "The Greatest Games",
    tag: "Cross-sport",
    desc: "The top games of all-time by Game Score across the NFL, NBA and MLB, plus every Stanley Cup presentation game.",
  },
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
  {
    league: "CFL",
    label: "CFL",
    sport: "Canadian Football",
    status: "live",
    page: "/teams/cfl",
    team_count: 0,
  },
  {
    league: "AFL",
    label: "AFL",
    sport: "Aussie Rules",
    status: "live",
    page: "/teams/afl",
    team_count: 0,
  },
  {
    league: "NRL",
    label: "NRL",
    sport: "Rugby League",
    status: "live",
    page: "/teams/nrl",
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

  // Sidebar hub links: every live league card that resolves to a real page.
  const hubs = composedCards
    .filter((c) => c.status === "live" && c.page)
    .map((c) => ({ label: c.label, sport: c.sport, href: c.page as string }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hub header */}
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">All Sports</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Sports</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every top-flight team on one interactive map. Filter by sport, league, or country, then jump
          to any league hub or cross-sport deep-dive from the console alongside.
        </p>
      </header>

      <HubNav
        items={[
          { label: "The map", href: "#map" },
          { label: "Hubs & deep-dives", href: "#console" },
          { label: "League directory", href: "#league-directory" },
        ]}
      />

      {/* Map-forward primary: interactive explorer (8 cols) + sticky console (4 cols).
          At lg+ the map leads and the console stays in view; below lg the console
          wraps underneath so mobile readers still see every hub in sequence. */}
      <section id="map" className="mb-12 scroll-mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 min-w-0">
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
              <div><strong className="text-[var(--text)] text-sm">{summary.major_markers.toLocaleString()}</strong> Major League &middot; <strong className="text-[var(--text)] text-sm">{summary.other_markers.toLocaleString()}</strong> College & second flight</div>
              <div><strong className="text-[var(--text)] text-sm">{summary.markers_with_team_page}</strong> with per-franchise pages</div>
              <div><strong className="text-[var(--text)] text-sm">{liveCount}</strong> leagues live &middot; {comingCount} coming</div>
            </div>

            <Suspense
              fallback={
                <div
                  className="rounded-lg border h-[540px] flex items-center justify-center text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Loading explorer&hellip;
                </div>
              }
            >
              <SportsExplorer teams={teams} />
            </Suspense>
          </div>

          <div className="lg:col-span-4">
            <SportsConsole hubs={hubs} deepDives={DEEP_DIVES} />
          </div>
        </div>
      </section>

      {/* Full league directory: the complete reference grid, below the fold. */}
      <section id="league-directory" className="mb-12 scroll-mt-20">
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

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Data from <Link href="/methodology" className="hover:text-[var(--text-muted)]">MetroAreas.xlsx</Link> Team List and FootballClub_Data.
        Gold markers are the Major League scope; slate markers are NCAA Division I, FBS, and second-flight or international competitions.
      </p>
    </main>
  );
}
'''


def fail(msg):
    print("ABORTED: " + msg)
    sys.exit(1)


def main():
    if not os.path.isfile(PAGE):
        fail(f"{PAGE} not found. Run this from the repo root (the folder containing app/sports/page.tsx).")

    with open(PAGE, "r", encoding="utf-8") as f:
        current = f.read()

    if "SportsConsole" in current:
        fail("page.tsx already references SportsConsole -- looks already applied. Nothing changed.")

    missing = [a for a in ANCHORS if a not in current]
    if missing:
        print("Could not find these expected anchors in app/sports/page.tsx:")
        for a in missing:
            print("  - " + a)
        fail("Working copy has drifted from the version this patch was built for. Send me the current page.tsx.")

    # Back up and write.
    shutil.copyfile(PAGE, PAGE + ".phase1.bak")
    if os.path.isfile(CONSOLE):
        shutil.copyfile(CONSOLE, CONSOLE + ".phase1.bak")

    with open(CONSOLE, "w", encoding="utf-8", newline="\n") as f:
        f.write(CONSOLE_TSX)
    with open(PAGE, "w", encoding="utf-8", newline="\n") as f:
        f.write(PAGE_TSX)

    print("Phase 1 applied.")
    print(f"  wrote   {CONSOLE}")
    print(f"  rewrote {PAGE}")
    print(f"  backups {PAGE}.phase1.bak" + (f" , {CONSOLE}.phase1.bak" if os.path.isfile(CONSOLE + '.phase1.bak') else ""))
    print()
    print("Next: run your TS type check, then preview locally before committing.")


if __name__ == "__main__":
    main()
