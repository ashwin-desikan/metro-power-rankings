import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { Suspense } from "react";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SportsExplorer, { type TeamMarker } from "./SportsExplorer";

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
  by_sport: Record<string, number>;
  by_league_top: Record<string, number>;
  by_country_top: Record<string, number>;
  markers_with_team_page: number;
  league_cards: LeagueCard[];
};

function loadJson<T>(rel: string): T {
  const file = path.join(process.cwd(), "public", "data", "sports", rel);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export default function SportsPage() {
  const teams = loadJson<TeamMarker[]>("all-teams.json");
  const summary = loadJson<Summary>("league-summary.json");
  const liveCount = summary.league_cards.filter((c) => c.status === "live").length;
  const comingCount = summary.league_cards.filter((c) => c.status === "coming").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">All Sports</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Every Major League team, on one map</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          {summary.total_markers.toLocaleString()} teams across {Object.keys(summary.by_sport).length} sports and {Object.keys(summary.by_country_top).length}+ countries.
          Filter by sport, league, or country, or jump straight to a per-franchise page where one exists.
          Per-team pages are live for NFL, MLB, and NBA today, with NHL queued next.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{summary.total_markers.toLocaleString()}</strong> Major League teams</div>
          <div><strong className="text-[var(--text)] text-sm">{summary.markers_with_team_page}</strong> with per-franchise pages</div>
          <div><strong className="text-[var(--text)] text-sm">{liveCount}</strong> leagues live · {comingCount} coming</div>
        </div>
      </header>

      {/* The interactive explorer (map + filters + search). Next 16
          requires useSearchParams() consumers to sit under a Suspense
          boundary during static prerender, even though we hydrate to a
          client component immediately on mount. */}
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

      {/* League summary cards */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-1">League directory</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Live cards link straight to the per-franchise pages. Coming-soon cards stay on this page until that league ships.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {summary.league_cards.map((c) => {
            const isLive = c.status === "live" && c.page;
            const inner = (
              <div
                className={`rounded-xl border p-4 h-full transition-colors ${
                  isLive ? "hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" : "opacity-65"
                }`}
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="font-semibold text-base tracking-tight">{c.label}</div>
                  {isLive ? (
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400">Live</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Soon</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{c.sport}</div>
                <div className="text-xs text-[var(--text-dim)] mt-1 tabular-nums">{c.team_count} teams</div>
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
        Launch scope is Major League only; college and minor leagues to follow.
      </p>
    </main>
  );
}
