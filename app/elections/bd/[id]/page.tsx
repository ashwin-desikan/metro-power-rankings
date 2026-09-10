import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bdElectionById, bdNeighbours, bdEraOf, bdPartyColor, bdFmtInt, bdFmtPct } from "@/lib/bdElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = bdElectionById(id);
  if (!e) return {};
  const title = `${e.label} Bangladeshi General Election`;
  const path = `/elections/bd/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function BdElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = bdElectionById(id);
  if (!e) notFound();
  const { prev, next } = bdNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={bdEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/bd",
        hubName: "Bangladesh",
        headingSuffix: "Bangladeshi General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Jatiya Sangsad",
        colorOf: bdPartyColor,
        fmtInt: bdFmtInt,
        fmtPct: bdFmtPct,
      }}
    />
  );
}
