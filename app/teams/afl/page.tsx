import type { Metadata } from "next";
import { getAflMeta, getAllAflFranchises, getAflLatestLadder, getAflGrandFinalHistory } from "@/lib/afl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootyHub from "@/app/teams/_footy/FootyHub";
import { FOOTY } from "@/app/teams/_footy/config";
import { getAflLiveStandings } from "@/lib/aflStandings";
import { getSeasonSim } from "@/lib/seasonSim";

export const dynamicParams = false;
const PATH = "/teams/afl";
const TITLE = "AFL";
const DESC = "Every VFL/AFL club since 1897: all-time premierships and minor premierships, the latest-season ladder, an all-time honours table, and the full Grand Final roll. Sourced from afltables.com.";
export const metadata: Metadata = {
  title: TITLE, description: DESC, alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function AflPage() {
  const [live, sim] = await Promise.all([getAflLiveStandings(), getSeasonSim("afl")]);
  return <FootyHub copy={FOOTY.afl} meta={getAflMeta()} ladder={getAflLatestLadder()} franchises={getAllAflFranchises()} gfHistory={getAflGrandFinalHistory()} live={live} sim={sim} />;
}
