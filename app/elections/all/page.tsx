import type { Metadata } from "next";
import Link from "next/link";
import { ELECTION_HUBS, HUB_REGION, nextElections } from "@/lib/electionHubsMeta";
import { getElectionCensus } from "@/lib/electionCensus";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BackButton } from "../HubShared";
import HubIndex, { type HubRow } from "../HubIndex";

const PATH = "/elections/all";
const TITLE = "Every Election Hub";
const DESC =
  "The full A-Z of the election atlas: every polity covered, when it last voted, when it votes next, and how many contests are on file. Searchable, and sortable by the next election.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

export default function AllHubsPage() {
  // Contest counts come from the census, which deliberately excludes the
  // Vatican: a conclave is not a polity-wide ballot. It still belongs in an
  // index of hubs, so it simply shows no count.
  const counts = new Map(getElectionCensus().map((r) => [r.code, r.items.length]));

  const rows: HubRow[] = nextElections().map((r) => {
    const hub = ELECTION_HUBS[r.code];
    return {
      code: r.code,
      name: r.name,
      href: r.href,
      flagSrc: flagUrlByCode(r.flag),
      flagSrcSet: flagSrcSetByCode(r.flag),
      region: HUB_REGION[r.code] ?? "",
      last: hub.last,
      next: r.next,
      nextDate: r.date,
      confidence: r.confidence,
      daysAway: r.daysAway,
      overdue: r.overdue,
      contests: counts.get(r.code) ?? 0,
      note: hub.note ?? null,
      noteTone: hub.noteTone ?? null,
      compact: hub.tier === "compact",
    };
  });

  const total = rows.reduce((s, r) => s + r.contests, 0);
  const confirmed = rows.filter((r) => r.confidence === "confirmed").length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>All hubs</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/elections" label="Elections home" />
        <BackButton href="/elections/forecast" label="Forecasts" />
        <BackButton href="/elections/systems" label="Electoral systems" />
        <BackButton href="/elections/referendums" label="Referendums" />
        <BackButton href="/elections/under-fire" label="Elections under fire" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {rows.length} polities · {total.toLocaleString("en-US")} contests · {confirmed} with an
          officially set next date
        </p>
      </header>

      <HubIndex rows={rows} />

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        The landing page groups these four ways round a map and a two-century timeline; this page is
        the flat list, for when you know which country you want. Dates come from a single table,
        <code className="mx-1">lib/electionHubsMeta.ts</code>, which also feeds the forecast pipeline,
        so a date shown here is the date the models use.
      </footer>
    </main>
  );
}
