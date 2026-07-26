import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getZaElections, zaElectionById, zaNeighbours, zaEraOf, zaPartyColor, zaFmtInt, zaFmtPct } from "@/lib/zaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = zaElectionById(id);
  if (!e) return {};
  const title = `${e.label} South African General Election`;
  const path = `/elections/za/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ZaElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = zaElectionById(id);
  if (!e) notFound();
  const { prev, next } = zaNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={zaEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/za",
        hubName: "South Africa",
        headingSuffix: "South African General Election",
        roleLabel: "Government leader",
        chamberFallback: "the Assembly",
        colorOf: zaPartyColor,
        fmtInt: zaFmtInt,
        fmtPct: zaFmtPct,
      }}
    />
  );
}
