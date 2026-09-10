import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { thElectionById, thNeighbours, thEraOf, thPartyColor, thFmtInt, thFmtPct } from "@/lib/thElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = thElectionById(id);
  if (!e) return {};
  const title = `${e.label} Thai General Election`;
  const path = `/elections/th/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ThElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = thElectionById(id);
  if (!e) notFound();
  const { prev, next } = thNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={thEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/th",
        hubName: "Thailand",
        headingSuffix: "Thai General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Representatives",
        colorOf: thPartyColor,
        fmtInt: thFmtInt,
        fmtPct: thFmtPct,
      }}
    />
  );
}
