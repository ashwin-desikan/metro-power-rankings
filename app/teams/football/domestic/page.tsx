import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getDomesticClubs, getDomesticFacets } from "@/lib/domesticFootball";
import { FootballHero } from "@/app/teams/_shared/FootballHero";
import { StatTile, StatGrid } from "@/app/teams/_shared/StatTile";
import DomesticLeaguesTable from "./DomesticLeaguesTable";

export const metadata: Metadata = {
  title: "Domestic Leagues Worldwide",
  description:
    "Every club that has ever played a tracked first division: every UEFA association in full, plus " +
    "selected leagues from the other confederations (CONMEBOL, CONCACAF, AFC, CAF, OFC). League titles, " +
    "domestic cups, and continental and Champions League pedigree, split by country era, in one " +
    "sortable, filterable master table.",
  alternates: { canonical: "/teams/football/domestic" },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `Domestic Leagues Worldwide | ${SITE_NAME}`,
    description: "A single master table of first-division clubs across 66 countries, with honours, current form and metros.",
    url: `${BASE_URL}/teams/football/domestic`,
    type: "website",
  },
};

export default function DomesticLeaguesPage() {
  const clubs = getDomesticClubs();
  const facets = getDomesticFacets();
  const current = clubs.filter((c) => c.status === "current").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Football</Link>
        {" / "}
        <span>Domestic Leagues Worldwide</span>
      </nav>

      <FootballHubNav current="domestic" />

      <FootballHero
        eyebrow="Club Football"
        title={<h1 className="text-3xl font-semibold tracking-tight">Domestic Leagues Worldwide</h1>}
        subtitle={
          <>
            Every tracked first-division league in one place, the nine marquee leagues with dedicated hubs
            and the long tail beyond them: every club that has ever played in a tracked top flight across
            {" "}{facets.countries.length} countries, with all-time league titles, domestic cups, and
            continental and Champions League pedigree, plus home metro. Coverage includes every UEFA
            association in full, plus selected leagues from the other confederations (CONMEBOL, CONCACAF,
            AFC, CAF, OFC). Honours are split by country era, so filtering to a former state (Soviet Union,
            Yugoslavia) shows only the trophies won under that flag. The dedicated league hubs remain for
            depth; clubs with their own page are linked in colour. Use the Ever first division toggle to
            include clubs no longer in their top flight.
          </>
        }
        stats={
          <StatGrid>
            <StatTile label="Club entries" value={clubs.length.toLocaleString()} />
            <StatTile label="Currently first division" value={current.toLocaleString()} />
            <StatTile label="Countries" value={facets.countries.length} />
            <StatTile label="Confederations" value={facets.confederations.length} />
          </StatGrid>
        }
      />

      <HubNav items={[{ label: "Master Table", href: "#table" }]} />

      <section id="table">
        <DomesticLeaguesTable
          clubs={clubs}
          confederations={facets.confederations}
          countries={facets.countries}
        />
      </section>
    </main>
  );
}
