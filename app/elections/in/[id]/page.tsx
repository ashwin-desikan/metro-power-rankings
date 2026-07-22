import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInElections, inElectionById, inNeighbours, inEraOf, inPartyColor, inFmtInt, inFmtPct } from "@/lib/inElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export function generateStaticParams() {
  return getInElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = inElectionById(id);
  if (!e) return {};
  const title = `${e.label} Indian General Election`;
  const path = `/elections/in/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function InElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = inElectionById(id);
  if (!e) notFound();
  const { prev, next } = inNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={inEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/in",
        hubName: "India",
        headingSuffix: "Indian General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Lok Sabha",
        colorOf: inPartyColor,
        fmtInt: inFmtInt,
        fmtPct: inFmtPct,
      }}
    />
  );
}
