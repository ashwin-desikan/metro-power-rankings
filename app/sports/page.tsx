import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Suspense } from "react";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import SportsExplorer, { type TeamMarker } from "./SportsExplorer";
import SportsConsole from "./SportsConsole";
import { leagueStatusFor, LeagueStatusTag } from "@/lib/leagueStatus";
import { catalogByFamily } from "@/lib/sportsCatalog";

export const dynamicParams = false;

const PAGE_PATH = "/sports";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Zone Zero Sports Hub";
const PAGE_DESCRIPTION =
  "Citizen of Nowhere's sports hub. Every top-flight team in the world on one interactive map, ranked against the metro behind it rather than the trophy cabinet.";

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
    href: "/sports/rivalries",
    title: "Sports Rivalries",
    tag: "Cross-sport",
    desc: "The derbies, classics and grudge matches that define cities and nations, each side linked to its team page.",
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

// Editorial accent per deep dive (no cover images yet; color + type carry it).
const DEEP_DIVE_ACCENTS: Record<string, string> = {
  "/sports/geography-of-erasure": "#4ECDC4",
  "/sports/games": "#a855f7",
  "/sports/valuations": "#f59e0b",
  "/sports/rivalries": "#d4af37",
  "/top-teams": "#D4537E",
};
const DEFAULT_DEEP_DIVE_ACCENT = "#4ECDC4";
// The pinned spotlight piece shown as the large featured card.
const FEATURED_DEEP_DIVE = "/sports/geography-of-erasure";

export default function SportsPage() {
  const teams = loadJson<TeamMarker[]>("all-teams.json");
  const summary = loadJson<Summary>("league-summary.json");

  // The league directory is now driven entirely by lib/sportsCatalog, grouped
  // by sport family. Team counts (where a per-franchise league has them) are
  // merged in from the ETL summary by href; portal hubs have no count.
  const directoryGroups = catalogByFamily(true);
  const allEntries = directoryGroups.flatMap((g) => g.entries);
  const liveCount = allEntries.filter((c) => c.status !== "coming").length;
  const comingCount = allEntries.filter((c) => c.status === "coming").length;
  const countByHref = new Map<string, number>();
  for (const c of summary.league_cards) {
    if (c.page) countByHref.set(c.page, c.team_count);
  }

  const featuredDeepDive = DEEP_DIVES.find((d) => d.href === FEATURED_DEEP_DIVE) ?? DEEP_DIVES[0];
  const restDeepDives = DEEP_DIVES.filter((d) => d.href !== featuredDeepDive.href);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10">
      {/* Hub header */}
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/zone-zero-seal.svg" alt="Zone Zero" width={46} height={46} />
          <div className="text-xs uppercase tracking-widest text-[var(--text-dim)]">Citizen of Nowhere&rsquo;s</div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Zone Zero Sports Hub</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every top-flight team in the world on one map, ranked by the metro behind it rather than the trophy cabinet.
        </p>
        <p className="text-[var(--text-dim)] text-xs italic mt-2">Leave the suburbs to the old heads. The world is our outfield.</p>
        <a href="/sports/about" className="inline-block mt-3 text-sm text-[var(--accent)] hover:underline">What Zone Zero is &rarr;</a>
      </header>

      <HubNav
        items={[
          { label: "The map", href: "#map" },
          { label: "Deep dives", href: "#deep-dives" },
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
              Filter by sport, league, or country, or jump to a per-franchise page where one exists (NFL, MLB, NBA, NHL).
            </p>
            <p className="text-[var(--text-dim)] max-w-3xl text-xs mt-2">
              Rosters current to Feb 2026; changes land in <Link href="/updates" className="underline hover:text-[var(--accent)]">/updates</Link>.
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
            <SportsConsole deepDives={DEEP_DIVES} />
          </div>
        </div>
      </section>

      {/* Deep Dives - editorial features get a full-width band below the map,
          with one pinned spotlight, ahead of the league reference grid. */}
      <section id="deep-dives" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Deep Dives</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Cross-sport features that cut across leagues.</p>

        <Link
          href={featuredDeepDive.href}
          className="group block rounded-xl border p-6 mb-3 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            borderLeftWidth: "4px",
            borderLeftColor: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT }}
            >
              {featuredDeepDive.tag}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Featured</span>
          </div>
          <div className="text-2xl font-bold tracking-tight mb-2 group-hover:text-[var(--accent)]">{featuredDeepDive.title}</div>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl">{featuredDeepDive.desc}</p>
          <div
            className="mt-3 text-xs font-semibold"
            style={{ color: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT }}
          >
            Explore &rarr;
          </div>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {restDeepDives.map((d) => {
            const accent = DEEP_DIVE_ACCENTS[d.href] ?? DEFAULT_DEEP_DIVE_ACCENT;
            return (
              <Link
                key={d.href}
                href={d.href}
                className="group block rounded-xl border p-5 transition-colors hover:bg-[var(--bg-card-hover)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: "3px", borderLeftColor: accent }}
              >
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: accent }}>{d.tag}</div>
                <div className="font-semibold text-lg tracking-tight mb-1 group-hover:text-[var(--accent)]">{d.title}</div>
                <p className="text-sm text-[var(--text-muted)]">{d.desc}</p>
                <div className="mt-3 text-xs font-semibold" style={{ color: accent }}>Explore &rarr;</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Full league directory: the complete reference grid, grouped by sport
          family, below the fold. */}
      <section id="league-directory" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">League directory</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Grouped by sport. Coming-soon leagues stay on this page until they ship.
        </p>
        <Link
          href="/sports/standings"
          className="group flex items-center gap-3 rounded-xl border p-4 mb-3 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.4)" }}
        >
          <span aria-hidden className="inline-block rounded-full" style={{ width: 13, height: 13, background: "#10b981" }} />
          <span className="min-w-0">
            <span className="block font-semibold text-base tracking-tight" style={{ color: "#10b981" }}>
              Live Standings
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Every live league table on one page, grouped by sport and refreshed through each season.
            </span>
          </span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5">→</span>
        </Link>

        <Link
          href="/sports/champions"
          className="group flex items-center gap-3 rounded-xl border p-4 mb-6 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ background: "rgba(212,175,55,0.08)", borderColor: "rgba(212,175,55,0.4)" }}
        >
          <span aria-hidden className="text-2xl leading-none">🏆</span>
          <span className="min-w-0">
            <span className="block font-semibold text-base tracking-tight" style={{ color: "#d4af37" }}>
              Current Champions
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Every reigning Gold Standard champion across the world, one board.
            </span>
          </span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5">→</span>
        </Link>

        <div className="space-y-6">
          {directoryGroups.map((g) => (
            <div key={g.family}>
              <h3
                className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {g.family}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {g.entries.map((c) => {
                  const isLive = c.status !== "coming";
                  const count = countByHref.get(c.href) ?? 0;
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
                          <LeagueStatusTag status={leagueStatusFor(c.href) ?? { label: "Live", tone: "regular" }} />
                        </div>
                      )}
                      {count > 0 && (
                        <div className="text-xs text-[var(--text-dim)] mt-1 tabular-nums">{count} teams</div>
                      )}
                    </div>
                  );
                  return isLive ? (
                    <Link key={c.href} href={c.href} className="block">{inner}</Link>
                  ) : (
                    <div key={c.href}>{inner}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Gold markers are Major League scope; slate markers are college and second-flight. <Link href="/methodology" className="hover:text-[var(--text-muted)]">Methodology &rarr;</Link>
      </p>
    </main>
  );
}
