import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  irElectionById,
  irLegNeighbours,
  irPresNeighbours,
  irLegEraOf,
  irPresEraOf,
  irPartyColor,
  irFmtInt,
  irFmtPct,
} from "@/lib/irElections";
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
  const e = irElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Iranian Presidential Election` : `${e.label} Iranian Legislative Election`;
  const path = `/elections/ir/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function IrElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = irElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = irPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={irPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ir",
          hubName: "Iran",
          headingSuffix: "Iranian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: irPartyColor,
          fmtInt: irFmtInt,
          fmtPct: irFmtPct,
        }}
      />
    );
  }
  const { prev, next } = irLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={irLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ir",
        hubName: "Iran",
        headingSuffix: "Iranian Legislative Election",
        roleLabel: "President",
        chamberFallback: "the Islamic Consultative Assembly",
        colorOf: irPartyColor,
        fmtInt: irFmtInt,
        fmtPct: irFmtPct,
      }}
    />
  );
}
