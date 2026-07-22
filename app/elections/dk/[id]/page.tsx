import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDkElections, dkElectionById, dkNeighbours, dkEraOf, dkPartyColor, dkFmtInt, dkFmtPct } from "@/lib/dkElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export function generateStaticParams() {
  return getDkElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = dkElectionById(id);
  if (!e) return {};
  const title = `${e.label} Danish General Election`;
  const path = `/elections/dk/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function DkElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = dkElectionById(id);
  if (!e) notFound();
  const { prev, next } = dkNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={dkEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/dk",
        hubName: "Denmark",
        headingSuffix: "Danish General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Folketing",
        colorOf: dkPartyColor,
        fmtInt: dkFmtInt,
        fmtPct: dkFmtPct,
      }}
    />
  );
}
