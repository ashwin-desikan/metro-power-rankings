import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getUaElections,
  uaElectionById,
  uaLegNeighbours,
  uaPresNeighbours,
  uaLegEraOf,
  uaPresEraOf,
  uaPartyColor,
  uaFmtInt,
  uaFmtPct,
} from "@/lib/uaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export function generateStaticParams() {
  const f = getUaElections();
  return [...f.legislative, ...f.presidential].map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = uaElectionById(id);
  if (!e) return {};
  const title =
    e.kind === "presidential"
      ? `${e.label} Ukrainian Presidential Election`
      : `${e.label} Ukrainian Parliamentary Election`;
  const path = `/elections/ua/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function UaElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = uaElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = uaPresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={uaPresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/ua",
          hubName: "Ukraine",
          headingSuffix: "Ukrainian Presidential Election",
          eraAnchorPrefix: "pres-era-",
          colorOf: uaPartyColor,
          fmtInt: uaFmtInt,
          fmtPct: uaFmtPct,
        }}
      />
    );
  }
  const { prev, next } = uaLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={uaLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/ua",
        hubName: "Ukraine",
        headingSuffix: "Ukrainian Parliamentary Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the Verkhovna Rada",
        colorOf: uaPartyColor,
        fmtInt: uaFmtInt,
        fmtPct: uaFmtPct,
      }}
    />
  );
}
