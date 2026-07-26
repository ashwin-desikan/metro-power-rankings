import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  idElectionById,
  idLegNeighbours,
  idPresNeighbours,
  idLegEraOf,
  idPresEraOf,
  idPartyColor,
  idFmtInt,
  idFmtPct,
} from "@/lib/idElections";
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
  const e = idElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} Indonesian Presidential Election` : `${e.label} Indonesian Legislative Election`;
  const path = `/elections/id/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function IdElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = idElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = idPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={idPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/id",
          hubName: "Indonesia",
          headingSuffix: "Indonesian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: idPartyColor,
          fmtInt: idFmtInt,
          fmtPct: idFmtPct,
        }}
      />
    );
  }
  const { prev, next } = idLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={idLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/id",
        hubName: "Indonesia",
        headingSuffix: e.year < 1945 ? "Dutch East Indies Volksraad Election" : "Indonesian Legislative Election",
        roleLabel: "President",
        chamberFallback: "the DPR",
        colorOf: idPartyColor,
        fmtInt: idFmtInt,
        fmtPct: idFmtPct,
      }}
    />
  );
}
