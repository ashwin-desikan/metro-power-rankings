import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  clElectionById,
  clLegNeighbours,
  clPresNeighbours,
  clLegEraOf,
  clPresEraOf,
  clPartyColor,
  clFmtInt,
  clFmtPct,
} from "@/lib/clElections";
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
  const e = clElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Chilean Presidential Election` : `${e.label} Chilean Parliamentary Election`;
  const path = `/elections/cl/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ClElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = clElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = clPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={clPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/cl",
          hubName: "Chile",
          headingSuffix: "Chilean Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: clPartyColor,
          fmtInt: clFmtInt,
          fmtPct: clFmtPct,
        }}
      />
    );
  }
  const { prev, next } = clLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={clLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/cl",
        hubName: "Chile",
        headingSuffix: "Chilean Parliamentary Election",
        roleLabel: "President",
        chamberFallback: "the Chamber of Deputies",
        colorOf: clPartyColor,
        fmtInt: clFmtInt,
        fmtPct: clFmtPct,
      }}
    />
  );
}
