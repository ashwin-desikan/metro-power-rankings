import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ngElectionById,
  ngLegNeighbours,
  ngPresNeighbours,
  ngLegEraOf,
  ngPresEraOf,
  ngPartyColor,
  ngFmtInt,
  ngFmtPct,
} from "@/lib/ngElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = ngElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} Nigerian Presidential Election`
      : `${e.label} Nigerian Parliamentary Election`;
  const path = `/elections/ng/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function NgElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = ngElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = ngPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={ngPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ng",
          hubName: "Nigeria",
          headingSuffix: "Nigerian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: ngPartyColor,
          fmtInt: ngFmtInt,
          fmtPct: ngFmtPct,
        }}
      />
    );
  }
  const { prev, next } = ngLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={ngLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ng",
        hubName: "Nigeria",
        headingSuffix: "Nigerian Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the House of Representatives",
        colorOf: ngPartyColor,
        fmtInt: ngFmtInt,
        fmtPct: ngFmtPct,
      }}
    />
  );
}
