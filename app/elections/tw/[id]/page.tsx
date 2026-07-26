import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTwElections, twElectionById, twNeighbours, twEraOf, twPartyColor, twFmtInt, twFmtPct } from "@/lib/twElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

function twTitle(label: string, year: number): string {
  return year <= 1948
    ? `${label} Chinese Presidential Election`
    : `${label} Taiwanese Presidential Election`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = twElectionById(id);
  if (!e) return {};
  const title = twTitle(e.label, e.year);
  const path = `/elections/tw/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function TwElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = twElectionById(id);
  if (!e) notFound();
  const { prev, next } = twNeighbours(e.id);
  return (
    <PresElectionDetail
      e={e}
      era={twEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/tw",
        hubName: "Taiwan",
        headingSuffix: e.year <= 1948 ? "Chinese Presidential Election" : "Taiwanese Presidential Election",
        eraAnchorPrefix: "pres-era-",
        colorOf: twPartyColor,
        fmtInt: twFmtInt,
        fmtPct: twFmtPct,
      }}
    />
  );
}
