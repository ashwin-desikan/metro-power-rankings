import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  keElectionById,
  keLegNeighbours,
  kePresNeighbours,
  keLegEraOf,
  kePresEraOf,
  kePartyColor,
  keFmtInt,
  keFmtPct,
} from "@/lib/keElections";
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
  const e = keElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Kenyan Presidential Election` : `${e.label} Kenyan National Assembly Election`;
  const path = `/elections/ke/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function KeElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = keElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = kePresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={kePresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ke",
          hubName: "Kenya",
          headingSuffix: "Kenyan Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: kePartyColor,
          fmtInt: keFmtInt,
          fmtPct: keFmtPct,
        }}
      />
    );
  }
  const { prev, next } = keLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={keLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ke",
        hubName: "Kenya",
        headingSuffix: "Kenyan National Assembly Election",
        roleLabel: "President",
        chamberFallback: "the National Assembly",
        colorOf: kePartyColor,
        fmtInt: keFmtInt,
        fmtPct: keFmtPct,
      }}
    />
  );
}
