import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  plElectionById,
  plLegNeighbours,
  plPresNeighbours,
  plLegEraOf,
  plPresEraOf,
  plPartyColor,
  plFmtInt,
  plFmtPct,
} from "@/lib/plElections";
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
  const e = plElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? e.year < 1800
        ? `${e.label} Polish–Lithuanian Royal Election`
        : `${e.label} Polish Presidential Election`
      : `${e.label} Polish Parliamentary Election`;
  const path = `/elections/pl/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function PlElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = plElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = plPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={plPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/pl",
          hubName: "Poland",
          headingSuffix: e.year < 1800 ? "Polish–Lithuanian Royal Election" : "Polish Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: plPartyColor,
          fmtInt: plFmtInt,
          fmtPct: plFmtPct,
        }}
      />
    );
  }
  const { prev, next } = plLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={plLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/pl",
        hubName: "Poland",
        headingSuffix: "Polish Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Sejm",
        colorOf: plPartyColor,
        fmtInt: plFmtInt,
        fmtPct: plFmtPct,
      }}
    />
  );
}
