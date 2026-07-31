import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import SeasonHub, { type Hub } from "../SeasonHub";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
const PATH = "/teams/football/1993-94";
const TITLE = "1993-94 Club Football";
const DESC = "The completed 1993-94 club season: the Citizen of Nowhere club power ranking with trophy bonuses, UEFA country coefficients (the era's team-coefficient method), the Champions League, the UEFA Cup and the European Cup Winners' Cup, the Intercontinental Cup, every final domestic table across the confederations, and every cup result.";
export const metadata: Metadata = { title: TITLE, description: DESC, alternates: { canonical: PATH }, openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" }, twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC } };
export default function Page() {
  const hub = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "football", "hub-1993-94.json"), "utf-8")) as Hub;
  return <SeasonHub hub={hub} />;
}
