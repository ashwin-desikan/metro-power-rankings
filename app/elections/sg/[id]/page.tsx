import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSgElections, sgElectionById, sgNeighbours, sgEraOf, sgPartyColor, sgFmtInt, sgFmtPct } from "@/lib/sgElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export function generateStaticParams() {
  return getSgElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = sgElectionById(id);
  if (!e) return {};
  const title = `${e.label} Singaporean General Election`;
  const path = `/elections/sg/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function SgElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = sgElectionById(id);
  if (!e) notFound();
  const { prev, next } = sgNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={sgEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/sg",
        hubName: "Singapore",
        headingSuffix: "Singaporean General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "Parliament",
        colorOf: sgPartyColor,
        fmtInt: sgFmtInt,
        fmtPct: sgFmtPct,
      }}
    />
  );
}
