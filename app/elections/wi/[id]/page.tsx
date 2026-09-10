import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { wiElectionById, wiNeighbours, wiEraOf, wiPartyColor, wiFmtInt, wiFmtPct } from "@/lib/wiElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = wiElectionById(id);
  if (!e) return {};
  const title = `${e.label} West Indies Federal Election`;
  const path = `/elections/wi/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function WiElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = wiElectionById(id);
  if (!e) notFound();
  const { prev, next } = wiNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={wiEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/wi",
        hubName: "West Indies Federation",
        headingSuffix: "West Indies Federal Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Representatives",
        colorOf: wiPartyColor,
        fmtInt: wiFmtInt,
        fmtPct: wiFmtPct,
      }}
    />
  );
}
