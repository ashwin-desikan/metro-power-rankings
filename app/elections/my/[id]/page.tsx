import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMyElections, myElectionById, myNeighbours, myEraOf, myPartyColor, myFmtInt, myFmtPct } from "@/lib/myElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = myElectionById(id);
  if (!e) return {};
  const title = `${e.label} Malaysian General Election`;
  const path = `/elections/my/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function MyElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = myElectionById(id);
  if (!e) notFound();
  const { prev, next } = myNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={myEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/my",
        hubName: "Malaysia",
        headingSuffix: "Malaysian General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Dewan Rakyat",
        colorOf: myPartyColor,
        fmtInt: myFmtInt,
        fmtPct: myFmtPct,
      }}
    />
  );
}
