import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getChampionsWithLinks } from "@/lib/championsHub";
import { type ChampRow } from "./ChampionsTable";
import ChampionsView from "./ChampionsView";
import { getCompetitionIndex } from "@/lib/championsHistory";

export const dynamicParams = false;

const PATH = "/sports/champions";
const TITLE = "Champions";
const DESC =
  "Champions across every competition we track: the current reigning holders on one board, a time machine to see who held every trophy in any month and year, plus all-time honour rolls for each competition, every champion linked to its team page and home metro.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

const SPORT_ORDER = [
  "Football",
  "W Football",
  "American Football",
  "Canadian Football",
  "Basketball",
  "W Basketball",
  "Baseball",
  "Hockey",
  "Cricket",
  "Rugby Union",
  "Rugby League",
  "Aussie Rules",
  "Handball",
  "Volleyball",
];

function sportRank(s: string): number {
  const i = SPORT_ORDER.indexOf(s);
  return i === -1 ? SPORT_ORDER.length : i;
}

export default function ChampionsHubPage() {
  const rows = getChampionsWithLinks();
  const linked = rows.filter((r) => r.teamHref).length;
  const index = getCompetitionIndex();

  // One merged board, default order: the workbook's tier rank (lowest first;
  // not shown), then by sport, then competition name. The client table layers
  // scope / sport / region filters and column sorting on top.
  const tableRows = [...rows]
    .sort(
      (a, b) =>
        (a.tier ?? 99) - (b.tier ?? 99) ||
        (a.tierGuide ?? 999) - (b.tierGuide ?? 999) ||
        sportRank(a.sport) - sportRank(b.sport) ||
        a.competition.localeCompare(b.competition),
    )
    .map<ChampRow>((c) => ({
      team: c.team,
      teamHref: c.teamHref,
      crestName: c.crestName,
      sport: c.sport,
      competition: c.competition,
      leagueHref: c.leagueHref,
      scopeType: c.scopeType,
      geo: c.geo,
      region: c.region,
      year: c.year,
      dateAwarded: c.dateAwarded,
      nextAwarded: c.nextAwarded,
      nextAwardedDate: c.nextAwardedDate,
      tier: c.tier,
      tierGuide: c.tierGuide,
      gold: c.gold,
    }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Champions</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-2xl">🏆</span>
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: GOLD }}>
            Reigning holders &amp; honour rolls
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Champions</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Three views, one board. <strong className="text-[var(--text)]">Current</strong> lists every
          reigning champion across the Gold Standard competitions and selected leagues, filterable by
          scope, sport or region. <strong className="text-[var(--text)]">Time Machine</strong> asks the
          same board any date: pick a month and year to see who held every trophy that month, with both
          holders shown when a title changed hands mid-month.{" "}
          <strong className="text-[var(--text)]">All-Time</strong> opens the honour rolls: every champion
          of every competition we track, each linked to its team page and, for club sports, the home
          metro that won it.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] mt-3">
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{rows.length}</strong> competitions tracked
          </div>
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{linked}</strong> linked to a team page
          </div>
        </div>
      </header>

      <div className="mt-6">
        <ChampionsView current={tableRows} index={index} />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-10">
        Source of truth: the Zone Zero champions ledger. Gold Standard competitions are the ultimate
        trophy in each sport; selected continental and domestic leagues are highlighted alongside.
      </p>
    </main>
  );
}
