import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEsElections, esElectionById, esNeighbours, esEraOf, esPartyColor, esFmtInt, esFmtPct } from "@/lib/esElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = esElectionById(id);
  if (!e) return {};
  const title = `${e.label} Spanish General Election`;
  const path = `/elections/es/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function EsElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = esElectionById(id);
  if (!e) notFound();
  const { prev, next } = esNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={esEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/es",
        hubName: "Spain",
        headingSuffix: "Spanish General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Congress",
        colorOf: esPartyColor,
        fmtInt: esFmtInt,
        fmtPct: esFmtPct,
      }}
    />
  );
}
