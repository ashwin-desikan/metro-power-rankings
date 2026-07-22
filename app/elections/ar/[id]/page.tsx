import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArElections, arElectionById, arNeighbours, arEraOf, arPartyColor, arFmtInt, arFmtPct } from "@/lib/arElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PresElectionDetail from "../../PresDetailShared";

export function generateStaticParams() {
  return getArElections().elections.map((e) => ({ id: e.id }));
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
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
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
