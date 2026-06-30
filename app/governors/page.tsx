import type { Metadata } from "next";
import Link from "next/link";
import { getAllStateGovernors, getTerritoryGovernors } from "@/lib/governors";
import { getState, getMetrosForState } from "@/lib/states";
import { getAllMetros } from "@/lib/data";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import GovernorsTable, { type GovRow } from "./GovernorsTable";

const PATH = "/governors";
const TITLE = "US Governors";
const DESC =
  "The current governor of every US state and the five major US territories, with party, date assumed office, and the combined Metro Power score of the metros in each. Sortable; click any column header.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

function scoreFor(metros: { score?: number | null }[]): number {
  return metros.reduce((s, m) => s + (m.score || 0), 0);
}

export default function GovernorsPage() {
  const states = getAllStateGovernors();
  const terr = getTerritoryGovernors();

  const stateRows: GovRow[] = Object.entries(states)
    .map(([slug, g]) => {
      const metros = getMetrosForState(slug);
      return {
        slug,
        name: getState(slug)?.name ?? slug,
        href: `/states/${slug}`,
        gov: g.name,
        party: g.party,
        since: g.since,
        score: scoreFor(metros),
        metros: metros.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const allMetros = getAllMetros();
  const terrRows: GovRow[] = Object.entries(terr)
    .map(([slug, g]) => {
      const metros = allMetros.filter((m) => m.countrySlug === slug);
      return {
        slug,
        name: g.countryName,
        href: `/countries/${slug}`,
        gov: g.name,
        party: g.party,
        since: g.since,
        score: scoreFor(metros),
        metros: metros.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const rep = stateRows.filter((r) => r.party.toLowerCase().includes("republican")).length;
  const dem = stateRows.filter((r) => r.party.toLowerCase().includes("democratic")).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/countries/united-states" className="hover:underline">United States</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2">
          {stateRows.length} state governors ·{" "}
          <span className="text-red-700 dark:text-red-400">{rep} Republican</span> ·{" "}
          <span className="text-blue-700 dark:text-blue-400">{dem} Democratic</span>
        </p>
      </header>

      <section className="mb-10">
        <GovernorsTable rows={stateRows} nameHeader="State" />
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">US Territories</h2>
        <GovernorsTable rows={terrRows} nameHeader="Territory" />
      </section>

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Governors current as of mid-2026; DC is led by a mayor and is not listed. The Metro score is the sum of the
        Metro Power composite scores of every tracked metro in the state. A metro that spans more than one state is
        counted in each, so state scores can total more than the national figure; a population-weighted split awaits
        per-state metro population data.
      </footer>
    </main>
  );
}
