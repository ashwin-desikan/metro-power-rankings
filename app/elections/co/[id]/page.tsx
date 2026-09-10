import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  coElectionById,
  coLegNeighbours,
  coPresNeighbours,
  coLegEraOf,
  coPresEraOf,
  coPartyColor,
  coFmtInt,
  coFmtPct,
} from "@/lib/coElections";
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
  const e = coElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Colombian Presidential Election` : `${e.label} Colombian Congressional Election`;
  const path = `/elections/co/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: ogImage(title, path), width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function CoElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = coElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = coPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={coPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/co",
          hubName: "Colombia",
          headingSuffix: "Colombian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: coPartyColor,
          fmtInt: coFmtInt,
          fmtPct: coFmtPct,
        }}
      />
    );
  }
  const { prev, next } = coLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={coLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/co",
        hubName: "Colombia",
        headingSuffix: "Colombian Congressional Election",
        roleLabel: "President",
        chamberFallback: "the Senate",
        colorOf: coPartyColor,
        fmtInt: coFmtInt,
        fmtPct: coFmtPct,
      }}
    />
  );
}
