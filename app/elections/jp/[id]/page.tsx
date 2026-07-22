import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getJpElections, jpElectionById, jpNeighbours, jpEraOf, jpPartyColor, jpFmtInt, jpFmtPct } from "@/lib/jpElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export function generateStaticParams() {
  return getJpElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = jpElectionById(id);
  if (!e) return {};
  const title = `${e.label} Japanese General Election`;
  const path = `/elections/jp/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function JpElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = jpElectionById(id);
  if (!e) notFound();
  const { prev, next } = jpNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={jpEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/jp",
        hubName: "Japan",
        headingSuffix: "Japanese General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House",
        colorOf: jpPartyColor,
        fmtInt: jpFmtInt,
        fmtPct: jpFmtPct,
      }}
    />
  );
}
