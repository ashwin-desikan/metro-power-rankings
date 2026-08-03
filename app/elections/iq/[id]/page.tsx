import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  iqElectionById,
  iqLegNeighbours,
  iqPresNeighbours,
  iqLegEraOf,
  iqPresEraOf,
  iqPartyColor,
  iqFmtInt,
  iqFmtPct,
} from "@/lib/iqElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

function presSuffix(year: number): string {
  return year <= 2002 ? "Iraqi Presidential Referendum" : "Iraqi Presidential Election";
}
function legChamber(year: number): string {
  if (year <= 1958) return "the Chamber of Deputies";
  if (year <= 2000) return "the National Assembly";
  return "the Council of Representatives";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = iqElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} ${presSuffix(e.year)}`
      : `${e.label} Iraqi Parliamentary Election`;
  const path = `/elections/iq/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function IqElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = iqElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = iqPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={iqPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/iq",
          hubName: "Iraq",
          headingSuffix: presSuffix(e.year),
          eraAnchorPrefix: "pres-era-",
          colorOf: iqPartyColor,
          fmtInt: iqFmtInt,
          fmtPct: iqFmtPct,
        }}
      />
    );
  }
  const { prev, next } = iqLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={iqLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/iq",
        hubName: "Iraq",
        headingSuffix: "Iraqi Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: legChamber(e.year),
        colorOf: iqPartyColor,
        fmtInt: iqFmtInt,
        fmtPct: iqFmtPct,
      }}
    />
  );
}
