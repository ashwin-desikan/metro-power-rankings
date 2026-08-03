import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIlElections, ilElectionById, ilNeighbours, ilEraOf, ilPartyColor, ilFmtInt, ilFmtPct } from "@/lib/ilElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = ilElectionById(id);
  if (!e) return {};
  const title = e.id === "2001" ? "2001 Israeli Prime Ministerial Election" : `${e.label} Israeli Election`;
  const path = `/elections/il/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function IlElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = ilElectionById(id);
  if (!e) notFound();
  const { prev, next } = ilNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={ilEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/il",
        hubName: "Israel",
        headingSuffix: e.id === "2001" ? "Israeli Prime Ministerial Election" : e.year < 1949 ? "Assembly of Representatives Election" : "Israeli Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Knesset",
        colorOf: ilPartyColor,
        fmtInt: ilFmtInt,
        fmtPct: ilFmtPct,
      }}
    />
  );
}
