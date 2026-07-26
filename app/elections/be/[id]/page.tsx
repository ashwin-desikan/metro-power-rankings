import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBeElections, beElectionById, beNeighbours, beEraOf, bePartyColor, beFmtInt, beFmtPct } from "@/lib/beElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = beElectionById(id);
  if (!e) return {};
  const title = `${e.label} Belgian General Election`;
  const path = `/elections/be/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function BeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = beElectionById(id);
  if (!e) notFound();
  const { prev, next } = beNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={beEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/be",
        hubName: "Belgium",
        headingSuffix: "Belgian General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Chamber of Representatives",
        colorOf: bePartyColor,
        fmtInt: beFmtInt,
        fmtPct: beFmtPct,
      }}
    />
  );
}
