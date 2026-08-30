import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  atElectionById,
  atLegNeighbours,
  atPresNeighbours,
  atLegEraOf,
  atPresEraOf,
  atPartyColor,
  atFmtInt,
  atFmtPct,
} from "@/lib/atElections";
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
  const e = atElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Austrian Presidential Election` : `${e.label} Austriaian Parliamentary Election`;
  const path = `/elections/at/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function AtElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = atElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = atPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={atPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/at",
          hubName: "Austria",
          headingSuffix: "Austrian Legislative Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: atPartyColor,
          fmtInt: atFmtInt,
          fmtPct: atFmtPct,
        }}
      />
    );
  }
  const { prev, next } = atLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={atLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/at",
        hubName: "Austria",
        headingSuffix: "Austrian Legislative Election",
        roleLabel: "Chancellor",
        chamberFallback: "the National Council",
        colorOf: atPartyColor,
        fmtInt: atFmtInt,
        fmtPct: atFmtPct,
      }}
    />
  );
}
