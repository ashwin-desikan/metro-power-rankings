import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  uaElectionById,
  uaLegNeighbours,
  uaPresNeighbours,
  uaLegEraOf,
  uaPresEraOf,
  uaPartyColor,
  uaFmtInt,
  uaFmtPct,
} from "@/lib/uaElections";
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
  const e = uaElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} Ukrainian Presidential Election`
      : `${e.label} Ukrainian Parliamentary Election`;
  const path = `/elections/ua/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function UaElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = uaElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = uaPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={uaPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ua",
          hubName: "Ukraine",
          headingSuffix: "Ukrainian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: uaPartyColor,
          fmtInt: uaFmtInt,
          fmtPct: uaFmtPct,
        }}
      />
    );
  }
  const { prev, next } = uaLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={uaLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ua",
        hubName: "Ukraine",
        headingSuffix: "Ukrainian Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Verkhovna Rada",
        colorOf: uaPartyColor,
        fmtInt: uaFmtInt,
        fmtPct: uaFmtPct,
      }}
    />
  );
}
