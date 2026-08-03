import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import SeasonHub, { type Hub } from "../SeasonHub";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
const PATH = "/teams/football/2015-16";
const TITLE = "2015-16 Club Football";
const DESC = "The completed 2015-16 club season: the Citizen of Nowhere club power ranking with trophy bonuses, UEFA country coefficients (the era's team-coefficient method), European competitions, every final domestic table across the confederations, and every cup result.";
export const metadata: Metadata = { title: TITLE, description: DESC, alternates: { canonical: PATH }, openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" }, twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC } };
export default function Page() {
  const hub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "football", "hub-2015-16.json"), "utf-8")) as Hub;
  return <SeasonHub hub={hub} />;
}
