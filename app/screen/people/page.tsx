import type { Metadata } from "next";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortTable from "../../sound/SortTable";
import ScreenNav from "../ScreenNav";
import { peopleCols, directorCols, personRow } from "../shared";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — People";
const DESC =
  "The actors, directors and craft nominees behind a century of hits and Oscar nights, scored by era-normalized box office credit and award prestige, each mapped to the metro that raised them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/people" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/people`, type: "website" },
};

export default function ScreenPeoplePage() {
  const f = getScreen();
  if (!f) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The people</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Top 250 of {f.totals.people.toLocaleString("en-US")} scored people. Box office points come
          from top-grossing credits (director-weighted, billing-order decay); prestige from
          {" "}{f.totals.nominations.toLocaleString("en-US")} nominations and wins, weighted toward the marquee categories.
        </p>
      </header>
      <SortTable rows={f.people.slice(0, 250).map(personRow)} cols={peopleCols} initialSort="combined" />

      <h2 className="text-2xl font-bold tracking-tight text-[var(--text)] mt-10 mb-2">The directors</h2>
      <p className="max-w-3xl text-sm text-[var(--text-muted)] mb-4">
        Directors with at least two top-grossing films. The geography alone tells a story:
        Budapest, Krakow, Mulhouse and Wellington sit inside the top ten.
      </p>
      <SortTable rows={f.directors.slice(0, 60).map(personRow)} cols={directorCols} initialSort="combined" />
    </main>
  );
}
