import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import { getDomesticCupCompetitions, getDomesticCupAggregate } from "@/lib/football";
import CupsClient from "./CupsClient";

export const dynamicParams = false;

const PAGE_PATH = "/teams/football/cups";
const PAGE_TITLE = "English Domestic Cups";
const PAGE_DESCRIPTION =
  "Every FA Cup and League Cup semifinal and final, season by season, with an all-time SF/final/trophy table. The FA Cup from 1871-72 and the League Cup from 1960-61.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

const ORDER = [
  { id: "fa-cup", anchor: "fa-cup" },
  { id: "league-cup", anchor: "league-cup" },
];

export default function DomesticCupsPage() {
  const comps = getDomesticCupCompetitions();
  const present = ORDER.map((o) => ({ ...o, comp: comps[o.id] })).filter((o) => o.comp);
  const aggregate = getDomesticCupAggregate();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/teams/football" className="hover:underline">Club Football</Link>
        {" / "}
        <Link href="/teams/football/leagues/premier-league" className="hover:underline">Premier League</Link>
        {" / "}
        <span>English Domestic Cups</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight mb-2">English Domestic Cups</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every FA Cup and League Cup semifinal and final, season by season. The FA Cup runs from 1871-72,
          the world&apos;s oldest knockout competition; the League Cup from 1960-61. Browse by decade, or sort the
          all-time table below. Winners and runners-up link to their club pages.
        </p>
      </header>

      <HubNav
        items={[
          ...present.map((p) => ({ label: p.comp!.name, href: `#${p.anchor}` })),
          { label: "All-time record", href: "#aggregate" },
        ]}
      />

      <CupsClient
        competitions={present.map((p) => ({ id: p.id, anchor: p.anchor, comp: p.comp! }))}
        aggregate={aggregate}
      />
    </main>
  );
}
