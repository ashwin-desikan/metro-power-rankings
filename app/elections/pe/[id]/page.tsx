import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  peElectionById,
  peLegNeighbours,
  pePresNeighbours,
  peLegEraOf,
  pePresEraOf,
  pePartyColor,
  peFmtInt,
  peFmtPct,
} from "@/lib/peElections";
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
  const e = peElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Peruvian Presidential Election` : `${e.label} Peruvian Congressional Election`;
  const path = `/elections/pe/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function PeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = peElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = pePresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={pePresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/pe",
          hubName: "Peru",
          headingSuffix: "Peruvian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: pePartyColor,
          fmtInt: peFmtInt,
          fmtPct: peFmtPct,
        }}
      />
    );
  }
  const { prev, next } = peLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={peLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/pe",
        hubName: "Peru",
        headingSuffix: "Peruvian Congressional Election",
        roleLabel: "President",
        chamberFallback: "the Chamber of Deputies",
        colorOf: pePartyColor,
        fmtInt: peFmtInt,
        fmtPct: peFmtPct,
      }}
    />
  );
}
