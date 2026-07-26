import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  mxElectionById,
  mxLegNeighbours,
  mxPresNeighbours,
  mxLegEraOf,
  mxPresEraOf,
  mxPartyColor,
  mxFmtInt,
  mxFmtPct,
} from "@/lib/mxElections";
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
  const e = mxElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Mexican Presidential Election` : `${e.label} Mexican Legislative Election`;
  const path = `/elections/mx/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function MxElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = mxElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = mxPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={mxPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/mx",
          hubName: "Mexico",
          headingSuffix: "Mexican Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: mxPartyColor,
          fmtInt: mxFmtInt,
          fmtPct: mxFmtPct,
        }}
      />
    );
  }
  const { prev, next } = mxLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={mxLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/mx",
        hubName: "Mexico",
        headingSuffix: "Mexican Legislative Election",
        roleLabel: "President",
        chamberFallback: "the Chamber",
        colorOf: mxPartyColor,
        fmtInt: mxFmtInt,
        fmtPct: mxFmtPct,
      }}
    />
  );
}
