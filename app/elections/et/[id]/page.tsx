import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { etElectionById, etNeighbours, etEraOf, etPartyColor, etFmtInt, etFmtPct } from "@/lib/etElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = etElectionById(id);
  if (!e) return {};
  const title = `${e.label} Ethiopian General Election`;
  const path = `/elections/et/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function EtElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = etElectionById(id);
  if (!e) notFound();
  const { prev, next } = etNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={etEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/et",
        hubName: "Ethiopia",
        headingSuffix: "Ethiopian General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Peoples' Representatives",
        colorOf: etPartyColor,
        fmtInt: etFmtInt,
        fmtPct: etFmtPct,
      }}
    />
  );
}
