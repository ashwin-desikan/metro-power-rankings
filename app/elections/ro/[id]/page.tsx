import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  roElectionById,
  roLegNeighbours,
  roPresNeighbours,
  roLegEraOf,
  roPresEraOf,
  roPartyColor,
  roFmtInt,
  roFmtPct,
} from "@/lib/roElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = roElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Romanian Presidential Election` : `${e.label} Romanian Legislative Election`;
  const path = `/elections/ro/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function RoElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = roElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = roPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={roPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ro",
          hubName: "Romania",
          headingSuffix: "Romanian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: roPartyColor,
          fmtInt: roFmtInt,
          fmtPct: roFmtPct,
        }}
      />
    );
  }
  const { prev, next } = roLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={roLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ro",
        hubName: "Romania",
        headingSuffix: "Romanian Legislative Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Chamber of Deputies",
        colorOf: roPartyColor,
        fmtInt: roFmtInt,
        fmtPct: roFmtPct,
      }}
    />
  );
}
