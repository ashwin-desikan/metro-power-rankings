import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNrlFranchiseBySlug, getAllNrlSlugs, getNrlSeasons, getNrlGrandFinals } from "@/lib/nrl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootyTeam from "@/app/teams/_footy/FootyTeam";
import { FOOTY } from "@/app/teams/_footy/config";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import { getNrlLiveStandings } from "@/lib/nrlStandings";

export const dynamicParams = false;
export function generateStaticParams() { return getAllNrlSlugs().map((slug) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = getNrlFranchiseBySlug(slug);
  if (!f) return { title: "Club not found" };
  const path = `/teams/nrl/${slug}`;
  const desc = `${f.name}${f.active ? "" : " (defunct)"}: ${f.premierships} premiership${f.premierships === 1 ? "" : "s"}, ${f.minor_premierships} minor premiership${f.minor_premierships === 1 ? "" : "s"}, ${f.gf_apps} Grand Finals, all-time record ${f.w}-${f.d}-${f.l} over ${f.seasons} seasons since ${f.first_year}.`;
  return {
    title: `${f.name}${f.active ? "" : " (defunct)"}`, description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${f.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${f.name} | ${SITE_NAME}`, description: desc },
  };
}

export default async function NrlTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = getNrlFranchiseBySlug(slug);
  if (!f) notFound();
  const live = await getNrlLiveStandings();
  const liveRow = live?.rows.find((r) => r.slug === slug) ?? null;
  return <FootyTeam copy={FOOTY.nrl} f={f} seasons={getNrlSeasons(slug)} grandFinals={getNrlGrandFinals(slug)} live={liveRow} liveYear={live?.year ?? null} champions={getCurrentChampionships(f.name, "Rugby League")} rivals={getRivalries(f.name, "Rugby League", "NRL")} />;
}
