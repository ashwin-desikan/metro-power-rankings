import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  krElectionById,
  krLegNeighbours,
  krPresNeighbours,
  krLegEraOf,
  krPresEraOf,
  krPartyColor,
  krFmtInt,
  krFmtPct,
} from "@/lib/krElections";
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
  const e = krElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} South Korean Presidential Election` : `${e.label} South Korean Legislative Election`;
  const path = `/elections/kr/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function KrElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = krElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = krPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={krPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/kr",
          hubName: "South Korea",
          headingSuffix: "South Korean Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: krPartyColor,
          fmtInt: krFmtInt,
          fmtPct: krFmtPct,
        }}
      />
    );
  }
  const { prev, next } = krLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={krLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/kr",
        hubName: "South Korea",
        headingSuffix: "South Korean Legislative Election",
        roleLabel: "President",
        chamberFallback: "the Assembly",
        colorOf: krPartyColor,
        fmtInt: krFmtInt,
        fmtPct: krFmtPct,
      }}
    />
  );
}
