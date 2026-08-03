import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  trElectionById,
  trLegNeighbours,
  trPresNeighbours,
  trLegEraOf,
  trPresEraOf,
  trPartyColor,
  trFmtInt,
  trFmtPct,
} from "@/lib/trElections";
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
  const e = trElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} Turkish Presidential Election`
      : e.year < 1920
        ? `${e.label} Ottoman General Election`
        : `${e.label} Turkish General Election`;
  const path = `/elections/tr/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function TrElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = trElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = trPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={trPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/tr",
          hubName: "Turkey",
          headingSuffix: "Turkish Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: trPartyColor,
          fmtInt: trFmtInt,
          fmtPct: trFmtPct,
        }}
      />
    );
  }
  const { prev, next } = trLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={trLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/tr",
        hubName: "Turkey",
        headingSuffix: e.year < 1920 ? "Ottoman General Election" : "Turkish General Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Grand National Assembly",
        colorOf: trPartyColor,
        fmtInt: trFmtInt,
        fmtPct: trFmtPct,
      }}
    />
  );
}
