import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDeElections, deElectionById, deNeighbours, deEraOf, dePartyColor, deFmtInt, deFmtPct } from "@/lib/deElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = deElectionById(id);
  if (!e) return {};
  const title = `${e.label} German Federal Election`;
  const path = `/elections/de/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function DeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = deElectionById(id);
  if (!e) notFound();
  const { prev, next } = deNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={deEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/de",
        hubName: "Germany",
        headingSuffix: "German Federal Election",
        roleLabel: "Chancellor",
        chamberFallback: "the chamber",
        colorOf: dePartyColor,
        fmtInt: deFmtInt,
        fmtPct: deFmtPct,
      }}
    />
  );
}
