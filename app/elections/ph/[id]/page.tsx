import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPhElections, phElectionById, phNeighbours, phEraOf, phPartyColor, phFmtInt, phFmtPct } from "@/lib/phElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = phElectionById(id);
  if (!e) return {};
  const title = `${e.label} Philippine Presidential Election`;
  const path = `/elections/ph/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function PhElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = phElectionById(id);
  if (!e) notFound();
  const { prev, next } = phNeighbours(e.id);
  return (
    <PresElectionDetail
      e={e}
      era={phEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ph",
        hubName: "Philippines",
        headingSuffix: "Philippine Presidential Election",
        eraAnchorPrefix: "pres-era-",
        colorOf: phPartyColor,
        fmtInt: phFmtInt,
        fmtPct: phFmtPct,
      }}
    />
  );
}
