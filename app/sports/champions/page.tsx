import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getChampionsWithLinks } from "@/lib/championsHub";
import ChampionsTable, { type ChampRow } from "./ChampionsTable";

export const dynamicParams = false;

const PATH = "/sports/champions";
const TITLE = "Current Champions";
const DESC =
  "Every reigning champion across the Gold Standard competitions and selected leagues, on one board: World Cup holders, continental kings, and the domestic title-holders, each linked to its team page and league hub.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
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

  // One merged board, default order: the workbook's tier rank (lowest first;
  // not shown), then by sport, then competition name. The client table layers
  // scope / sport / region filters and column sorting on top.
  const tableRows = [...rows]
    .sort(
      (a, b) =>
        (a.tier ?? 99) - (b.tier ?? 99) ||
        sportRank(a.sport) - sportRank(b.sport) ||
        a.competition.localeCompare(b.competition),
    )
    .map<ChampRow>((c) => ({
      team: c.team,
      teamHref: c.teamHref,
      sport: c.sport,
      competition: c.competition,
      leagueHref: c.leagueHref,
      scopeType: c.scopeType,
      geo: c.geo,
      region: c.region,
      year: c.year,
      nextAwarded: c.nextAwarded,
      gold: c.gold,
    }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pt-24">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Current Champions</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-2xl">🏆</span>
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: GOLD }}>
            Reigning holders
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Current Champions</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every reigning champion across the Gold Standard competitions and the selected leagues we
          highlight, on one board. Each champion links to its team page where one exists, and to the
          league hub; the Region column gives each competition's reach, from World to continent to
          country. Filter by scope, sport or region, and click any column header to sort. Maintained
          by hand against the source of truth; updated as each title changes hands.
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
        <ChampionsTable rows={tableRows} />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-10">
        Source of truth: the Zone Zero champions ledger. Gold Standard competitions are the ultimate
        trophy in each sport; selected continental and domestic leagues are highlighted alongside.
      </p>
    </main>
  );
}
