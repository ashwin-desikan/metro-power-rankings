import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  skElectionById,
  skLegNeighbours,
  skPresNeighbours,
  skLegEraOf,
  skPresEraOf,
  skPartyColor,
  skFmtInt,
  skFmtPct,
} from "@/lib/skElections";
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
  const e = skElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Slovak Presidential Election` : `${e.label} Slovak National Council Election`;
  const path = `/elections/sk/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function SkElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = skElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = skPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={skPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/sk",
          hubName: "Slovakia",
          headingSuffix: "Slovak Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: skPartyColor,
          fmtInt: skFmtInt,
          fmtPct: skFmtPct,
        }}
      />
    );
  }
  const { prev, next } = skLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={skLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/sk",
        hubName: "Slovakia",
        headingSuffix: "Slovak National Council Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the National Council",
        colorOf: skPartyColor,
        fmtInt: skFmtInt,
        fmtPct: skFmtPct,
      }}
    />
  );
}
