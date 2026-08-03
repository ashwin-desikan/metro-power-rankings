import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCnElections, cnElectionById, cnNeighbours, cnEraOf, cnPartyColor, cnFmtInt, cnFmtPct } from "@/lib/cnElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = cnElectionById(id);
  if (!e) return {};
  const path = `/elections/cn/${e.id}`;
  return {
    title: `${e.label}, ${e.year}`,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${e.label}, ${e.year} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function CnElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = cnElectionById(id);
  if (!e) notFound();
  const { prev, next } = cnNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={cnEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/cn",
        hubName: "China",
        headingSuffix: "National Congress",
        roleLabel: "NPC Chairman",
        chamberFallback: "the National People's Congress",
        colorOf: cnPartyColor,
        fmtInt: cnFmtInt,
        fmtPct: cnFmtPct,
      }}
    />
  );
}
