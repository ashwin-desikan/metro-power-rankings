import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  cuElectionById,
  cuLegNeighbours,
  cuPresNeighbours,
  cuLegEraOf,
  cuPresEraOf,
  cuPartyColor,
  cuFmtInt,
  cuFmtPct,
} from "@/lib/cuElections";
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
  const e = cuElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Cuban Presidential Election` : `${e.label} Cuban Legislative Election`;
  const path = `/elections/cu/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function CuElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = cuElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = cuPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={cuPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/cu",
          hubName: "Cuba",
          headingSuffix: "Cuban Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: cuPartyColor,
          fmtInt: cuFmtInt,
          fmtPct: cuFmtPct,
        }}
      />
    );
  }
  const { prev, next } = cuLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={cuLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/cu",
        hubName: "Cuba",
        headingSuffix: "Cuban Legislative Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the National Assembly",
        colorOf: cuPartyColor,
        fmtInt: cuFmtInt,
        fmtPct: cuFmtPct,
      }}
    />
  );
}
