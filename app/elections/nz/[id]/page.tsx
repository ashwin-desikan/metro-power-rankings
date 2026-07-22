import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNzElections, nzElectionById, nzNeighbours, nzEraOf, nzPartyColor, nzFmtInt, nzFmtPct } from "@/lib/nzElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export function generateStaticParams() {
  return getNzElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = nzElectionById(id);
  if (!e) return {};
  const title = `${e.label} New Zealand General Election`;
  const path = `/elections/nz/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function NzElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = nzElectionById(id);
  if (!e) notFound();
  const { prev, next } = nzNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={nzEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/nz",
        hubName: "New Zealand",
        headingSuffix: "New Zealand General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Representatives",
        colorOf: nzPartyColor,
        fmtInt: nzFmtInt,
        fmtPct: nzFmtPct,
      }}
    />
  );
}
