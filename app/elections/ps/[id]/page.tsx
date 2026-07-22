import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPsElections,
  psElectionById,
  psLegNeighbours,
  psPresNeighbours,
  psLegEraOf,
  psPresEraOf,
  psPartyColor,
  psFmtInt,
  psFmtPct,
} from "@/lib/psElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export function generateStaticParams() {
  const f = getPsElections();
  return [...f.legislative, ...f.presidential].map((e) => ({ id: e.id }));
}

function legSuffix(year: number): string {
  return year === 1923 ? "Palestinian Legislative Council Election" : "Palestinian Legislative Election";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = psElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} Palestinian Presidential Election`
      : `${e.label} ${legSuffix(e.year)}`;
  const path = `/elections/ps/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function PsElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = psElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = psPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={psPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ps",
          hubName: "Palestine",
          headingSuffix: "Palestinian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: psPartyColor,
          fmtInt: psFmtInt,
          fmtPct: psFmtPct,
        }}
      />
    );
  }
  const { prev, next } = psLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={psLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ps",
        hubName: "Palestine",
        headingSuffix: legSuffix(e.year),
        roleLabel: "Prime Minister",
        chamberFallback: "the Legislative Council",
        colorOf: psPartyColor,
        fmtInt: psFmtInt,
        fmtPct: psFmtPct,
      }}
    />
  );
}
