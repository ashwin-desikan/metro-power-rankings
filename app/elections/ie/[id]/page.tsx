import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ieElectionById,
  ieLegNeighbours,
  iePresNeighbours,
  ieLegEraOf,
  iePresEraOf,
  iePartyColor,
  ieFmtInt,
  ieFmtPct,
} from "@/lib/ieElections";
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
  const e = ieElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Irish Presidential Election` : `${e.label} Irelandian Parliamentary Election`;
  const path = `/elections/ie/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function IeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = ieElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = iePresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={iePresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ie",
          hubName: "Ireland",
          headingSuffix: "Irish General Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: iePartyColor,
          fmtInt: ieFmtInt,
          fmtPct: ieFmtPct,
        }}
      />
    );
  }
  const { prev, next } = ieLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={ieLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ie",
        hubName: "Ireland",
        headingSuffix: "Irish General Election",
        roleLabel: "Taoiseach",
        chamberFallback: "Dáil Éireann",
        colorOf: iePartyColor,
        fmtInt: ieFmtInt,
        fmtPct: ieFmtPct,
      }}
    />
  );
}
