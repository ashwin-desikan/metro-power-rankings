import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArElections, arElectionById, arNeighbours, arEraOf, arPartyColor, arFmtInt, arFmtPct } from "@/lib/arElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = arElectionById(id);
  if (!e) return {};
  const title = `${e.label} Argentine Presidential Election`;
  const path = `/elections/ar/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function ArElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = arElectionById(id);
  if (!e) notFound();
  const { prev, next } = arNeighbours(e.id);
  return (
    <PresElectionDetail
      e={e}
      era={arEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ar",
        hubName: "Argentina",
        headingSuffix: "Argentine Presidential Election",
        eraAnchorPrefix: "pres-era-",
        colorOf: arPartyColor,
        fmtInt: arFmtInt,
        fmtPct: arFmtPct,
      }}
    />
  );
}
