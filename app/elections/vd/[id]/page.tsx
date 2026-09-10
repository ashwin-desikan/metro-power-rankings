import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  vdElectionById,
  vdLegNeighbours,
  vdPresNeighbours,
  vdLegEraOf,
  vdPresEraOf,
  vdPartyColor,
  vdFmtInt,
  vdFmtPct,
} from "@/lib/vdElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = vdElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} South Vietnamese Presidential Election` : `${e.label} South Vietnamese Lower-House Election`;
  const path = `/elections/vd/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function VdElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = vdElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = vdPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={vdPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/vd",
          hubName: "South Vietnam",
          headingSuffix: "South Vietnamese Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: vdPartyColor,
          fmtInt: vdFmtInt,
          fmtPct: vdFmtPct,
        }}
      />
    );
  }
  const { prev, next } = vdLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={vdLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/vd",
        hubName: "South Vietnam",
        headingSuffix: "South Vietnamese Lower-House Election",
        roleLabel: "President",
        chamberFallback: "the National Assembly",
        colorOf: vdPartyColor,
        fmtInt: vdFmtInt,
        fmtPct: vdFmtPct,
      }}
    />
  );
}
