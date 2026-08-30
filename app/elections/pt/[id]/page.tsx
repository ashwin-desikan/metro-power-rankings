import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ptElectionById,
  ptLegNeighbours,
  ptPresNeighbours,
  ptLegEraOf,
  ptPresEraOf,
  ptPartyColor,
  ptFmtInt,
  ptFmtPct,
} from "@/lib/ptElections";
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
  const e = ptElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Portuguese Presidential Election` : `${e.label} Portugalian Parliamentary Election`;
  const path = `/elections/pt/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function PtElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = ptElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = ptPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={ptPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/pt",
          hubName: "Portugal",
          headingSuffix: "Portuguese Legislative Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: ptPartyColor,
          fmtInt: ptFmtInt,
          fmtPct: ptFmtPct,
        }}
      />
    );
  }
  const { prev, next } = ptLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={ptLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/pt",
        hubName: "Portugal",
        headingSuffix: "Portuguese Legislative Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Assembly of the Republic",
        colorOf: ptPartyColor,
        fmtInt: ptFmtInt,
        fmtPct: ptFmtPct,
      }}
    />
  );
}
