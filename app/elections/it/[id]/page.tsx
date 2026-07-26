import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getItElections, itElectionById, itNeighbours, itEraOf, itPartyColor, itFmtInt, itFmtPct } from "@/lib/itElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = itElectionById(id);
  if (!e) return {};
  const title = `${e.label} Italian General Election`;
  const path = `/elections/it/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ItElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = itElectionById(id);
  if (!e) notFound();
  const { prev, next } = itNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={itEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/it",
        hubName: "Italy",
        headingSuffix: "Italian General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Chamber",
        colorOf: itPartyColor,
        fmtInt: itFmtInt,
        fmtPct: itFmtPct,
      }}
    />
  );
}
