import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  czElectionById,
  czLegNeighbours,
  czPresNeighbours,
  czLegEraOf,
  czPresEraOf,
  czPartyColor,
  czFmtInt,
  czFmtPct,
} from "@/lib/czElections";
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
  const e = czElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Czechoslovak or Czech Presidential Election` : `${e.label} Czechoslovak or Czech Legislative Election`;
  const path = `/elections/cz/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function CzElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = czElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = czPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={czPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/cz",
          hubName: "Czech Republic",
          headingSuffix: "Czechoslovak or Czech Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: czPartyColor,
          fmtInt: czFmtInt,
          fmtPct: czFmtPct,
        }}
      />
    );
  }
  const { prev, next } = czLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={czLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/cz",
        hubName: "Czech Republic",
        headingSuffix: "Czechoslovak or Czech Legislative Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Chamber of Deputies",
        colorOf: czPartyColor,
        fmtInt: czFmtInt,
        fmtPct: czFmtPct,
      }}
    />
  );
}
