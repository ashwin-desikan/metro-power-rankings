import type { Metadata } from "next";
import { getNrlMeta, getAllNrlFranchises, getNrlLatestLadder, getNrlGrandFinalHistory } from "@/lib/nrl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootyHub from "@/app/teams/_footy/FootyHub";
import { FOOTY } from "@/app/teams/_footy/config";
import { getNrlLiveStandings } from "@/lib/nrlStandings";
import { getSeasonSim } from "@/lib/seasonSim";
import { getFootyFinals, finalsIsCurrent } from "@/lib/footyFinals";
import StateOfOrigin from "./StateOfOrigin";

export const dynamicParams = false;
const PATH = "/teams/nrl";
const TITLE = "NRL";
const DESC = "Every NSWRL/ARL/NRL club since 1908: all-time premierships and minor premierships, the latest-season ladder, an all-time honours table, and the full Grand Final roll. Sourced from afltables.com.";
export const metadata: Metadata = {
  title: TITLE, description: DESC, alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function NrlPage() {
  const [live, sim, finals] = await Promise.all([getNrlLiveStandings(), getSeasonSim("nrl"), getFootyFinals("nrl")]);
  return <FootyHub copy={FOOTY.nrl} meta={getNrlMeta()} ladder={getNrlLatestLadder()} franchises={getAllNrlFranchises()} gfHistory={getNrlGrandFinalHistory()} live={live} sim={sim} finals={finalsIsCurrent(finals) ? finals : null} extra={<StateOfOrigin />} extraNav={{ label: "State of Origin", href: "#origin" }} />;
}
