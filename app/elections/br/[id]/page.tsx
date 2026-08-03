import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  brElectionById,
  brLegNeighbours,
  brPresNeighbours,
  brLegEraOf,
  brPresEraOf,
  brPartyColor,
  brFmtInt,
  brFmtPct,
} from "@/lib/brElections";
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
  const e = brElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Brazilian Presidential Election` : `${e.label} Brazilian Parliamentary Election`;
  const path = `/elections/br/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function BrElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = brElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = brPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={brPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/br",
          hubName: "Brazil",
          headingSuffix: "Brazilian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: brPartyColor,
          fmtInt: brFmtInt,
          fmtPct: brFmtPct,
        }}
      />
    );
  }
  const { prev, next } = brLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={brLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/br",
        hubName: "Brazil",
        headingSuffix: "Brazilian Parliamentary Election",
        roleLabel: "President",
        chamberFallback: "the Chamber",
        colorOf: brPartyColor,
        fmtInt: brFmtInt,
        fmtPct: brFmtPct,
      }}
    />
  );
}
