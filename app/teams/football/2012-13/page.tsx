import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import SeasonHub, { type Hub } from "../SeasonHub";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
const PATH = "/teams/football/2012-13";
const TITLE = "2012-13 Club Football";
const DESC = "The completed 2012-13 club season: the Citizen of Nowhere club power ranking with trophy bonuses, UEFA country coefficients (the era's team-coefficient method), European competitions, every final domestic table across the confederations, and every cup result.";
export const metadata: Metadata = { title: TITLE, description: DESC, alternates: { canonical: PATH }, openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" }, twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC } };
export default function Page() {
  const hub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "football", "hub-2012-13.json"), "utf-8")) as Hub;
  return <SeasonHub hub={hub} />;
}
