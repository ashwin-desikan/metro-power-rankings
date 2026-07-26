import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ruElectionById,
  ruLegNeighbours,
  ruPresNeighbours,
  ruLegEraOf,
  ruPresEraOf,
  ruPartyColor,
  ruFmtInt,
  ruFmtPct,
} from "@/lib/ruElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

function legSuffix(year: number): string {
  if (year <= 1912) return "Imperial Russian Legislative Election";
  if (year === 1917) return "Russian Constituent Assembly Election";
  if (year === 1921) return "Russian Legislative Election";
  return year >= 1993 ? "Russian Legislative Election" : "Soviet Legislative Election";
}
function legChamber(year: number): string {
  if (year <= 1912) return "the State Duma";
  if (year === 1917) return "the Constituent Assembly";
  if (year === 1921) return "the Congress of Soviets";
  return year >= 1993 ? "the State Duma" : "the Supreme Soviet";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = ruElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? e.year === 1990
        ? "1990 Soviet Presidential Election"
        : `${e.label} Russian Presidential Election`
      : `${e.label} ${legSuffix(e.year)}`;
  const path = `/elections/ru/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function RuElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = ruElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = ruPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={ruPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ru",
          hubName: "Russia",
          headingSuffix: e.year === 1990 ? "Soviet Presidential Election" : "Russian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: ruPartyColor,
          fmtInt: ruFmtInt,
          fmtPct: ruFmtPct,
        }}
      />
    );
  }
  const { prev, next } = ruLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={ruLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ru",
        hubName: "Russia",
        headingSuffix: legSuffix(e.year),
        roleLabel: e.year >= 1922 && e.year <= 1989 ? "Premier" : "Prime Minister",
        chamberFallback: legChamber(e.year),
        colorOf: ruPartyColor,
        fmtInt: ruFmtInt,
        fmtPct: ruFmtPct,
      }}
    />
  );
}
