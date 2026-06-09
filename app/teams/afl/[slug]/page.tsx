import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAflFranchiseBySlug, getAllAflSlugs, getAflSeasons, getAflGrandFinals } from "@/lib/afl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootyTeam from "@/app/teams/_footy/FootyTeam";
import { FOOTY } from "@/app/teams/_footy/config";
import { getAflLiveStandings } from "@/lib/aflStandings";

export const dynamicParams = false;
export function generateStaticParams() { return getAllAflSlugs().map((slug) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = getAflFranchiseBySlug(slug);
  if (!f) return { title: "Club not found" };
  const path = `/teams/afl/${slug}`;
  const desc = `${f.name}${f.active ? "" : " (defunct)"}: ${f.premierships} premiership${f.premierships === 1 ? "" : "s"}, ${f.minor_premierships} minor premiership${f.minor_premierships === 1 ? "" : "s"}, ${f.gf_apps} Grand Finals, all-time record ${f.w}-${f.d}-${f.l} over ${f.seasons} seasons since ${f.first_year}.`;
  return {
    title: `${f.name}${f.active ? "" : " (defunct)"}`, description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${f.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${f.name} | ${SITE_NAME}`, description: desc },
  };
}

export default async function AflTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = getAflFranchiseBySlug(slug);
  if (!f) notFound();
  const live = await getAflLiveStandings();
  const liveRow = live?.rows.find((r) => r.slug === slug) ?? null;
  return <FootyTeam copy={FOOTY.afl} f={f} seasons={getAflSeasons(slug)} grandFinals={getAflGrandFinals(slug)} live={liveRow} liveYear={live?.year ?? null} />;
}
