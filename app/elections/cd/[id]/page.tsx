import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  cdElectionById,
  cdLegNeighbours,
  cdPresNeighbours,
  cdLegEraOf,
  cdPresEraOf,
  cdPartyColor,
  cdFmtInt,
  cdFmtPct,
} from "@/lib/cdElections";
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
  const e = cdElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Congolese Presidential Election` : `${e.label} Congolese Legislative Election`;
  const path = `/elections/cd/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function CdElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = cdElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = cdPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={cdPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/cd",
          hubName: "DR Congo",
          headingSuffix: "Congolese Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: cdPartyColor,
          fmtInt: cdFmtInt,
          fmtPct: cdFmtPct,
        }}
      />
    );
  }
  const { prev, next } = cdLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={cdLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/cd",
        hubName: "DR Congo",
        headingSuffix: "Congolese Legislative Election",
        roleLabel: "President",
        chamberFallback: "the National Assembly",
        colorOf: cdPartyColor,
        fmtInt: cdFmtInt,
        fmtPct: cdFmtPct,
      }}
    />
  );
}
