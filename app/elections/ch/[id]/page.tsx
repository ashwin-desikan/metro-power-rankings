import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChElections, chElectionById, chNeighbours, chEraOf, chPartyColor, chFmtInt, chFmtPct } from "@/lib/chElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = chElectionById(id);
  if (!e) return {};
  const title = `${e.label} Swiss Federal Election`;
  const path = `/elections/ch/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ChElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = chElectionById(id);
  if (!e) notFound();
  const { prev, next } = chNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={chEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ch",
        hubName: "Switzerland",
        headingSuffix: "Swiss Federal Election",
        roleLabel: "Federal Council",
        chamberFallback: "the National Council",
        colorOf: chPartyColor,
        fmtInt: chFmtInt,
        fmtPct: chFmtPct,
      }}
    />
  );
}
