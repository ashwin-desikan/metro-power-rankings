import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  egElectionById,
  egLegNeighbours,
  egPresNeighbours,
  egLegEraOf,
  egPresEraOf,
  egPartyColor,
  egFmtInt,
  egFmtPct,
} from "@/lib/egElections";
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
  const e = egElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Egyptian Presidential Election` : `${e.label} Egyptian Parliamentary Election`;
  const path = `/elections/eg/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function EgElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = egElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = egPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={egPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/eg",
          hubName: "Egypt",
          headingSuffix: "Egyptian Parliamentary Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: egPartyColor,
          fmtInt: egFmtInt,
          fmtPct: egFmtPct,
        }}
      />
    );
  }
  const { prev, next } = egLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={egLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/eg",
        hubName: "Egypt",
        headingSuffix: "Egyptian Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Representatives",
        colorOf: egPartyColor,
        fmtInt: egFmtInt,
        fmtPct: egFmtPct,
      }}
    />
  );
}
