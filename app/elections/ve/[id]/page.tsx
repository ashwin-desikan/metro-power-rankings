import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  veElectionById,
  veLegNeighbours,
  vePresNeighbours,
  veLegEraOf,
  vePresEraOf,
  vePartyColor,
  veFmtInt,
  veFmtPct,
} from "@/lib/veElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = veElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Venezuelan Presidential Election` : `${e.label} Venezuelan Legislative Election`;
  const path = `/elections/ve/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function VeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = veElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = vePresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={vePresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ve",
          hubName: "Venezuela",
          headingSuffix: "Venezuelan Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: vePartyColor,
          fmtInt: veFmtInt,
          fmtPct: veFmtPct,
        }}
      />
    );
  }
  const { prev, next } = veLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={veLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ve",
        hubName: "Venezuela",
        headingSuffix: "Venezuelan Legislative Election",
        roleLabel: "President",
        chamberFallback: "the National Assembly",
        colorOf: vePartyColor,
        fmtInt: veFmtInt,
        fmtPct: veFmtPct,
      }}
    />
  );
}
