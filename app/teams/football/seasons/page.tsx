import type { Metadata } from "next";
import Link from "next/link";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import fs from "fs";
import path from "path";
import SeasonTrends, { type TrendsData } from "../SeasonTrends";

const PATH = "/teams/football/seasons";
const TITLE = "Club Football by Season";
const DESC = "Completed-season club football hubs: the Citizen of Nowhere power ranking, UEFA coefficients, European competitions, final league tables and cup results, season by season.";
export const metadata: Metadata = {
  title: TITLE, description: DESC, alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};
const SEASONS: { slug: string; label: string; note: string; live?: boolean }[] = [
  { slug: "2026-27", label: "2026-27", note: "Live season, in progress", live: true },
  { slug: "2025-26", label: "2025-26", note: "Champions League: Paris Saint-Germain" },
  { slug: "2024-25", label: "2024-25", note: "Champions League: Paris Saint-Germain · Club World Cup: Chelsea" },
  { slug: "2023-24", label: "2023-24", note: "Champions League: Real Madrid" },
  { slug: "2022-23", label: "2022-23", note: "The treble: Manchester City" },
  { slug: "2021-22", label: "2021-22", note: "Champions League: Real Madrid" },
  { slug: "2020-21", label: "2020-21", note: "Champions League: Chelsea · Club World Cup: Bayern Munich" },
  { slug: "2019-20", label: "2019-20", note: "The treble: Bayern Munich" },
  { slug: "2018-19", label: "2018-19", note: "Champions League: Liverpool" },
  { slug: "2017-18", label: "2017-18", note: "Champions League: Real Madrid" },
  { slug: "2016-17", label: "2016-17", note: "Champions League: Real Madrid" },
];
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

export default function SeasonsIndex() {
  const trends = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "football", "football-trends.json"), "utf-8")) as TrendsData;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4"><Link href="/" className="hover:underline">Home</Link>{" / "}<Link href="/teams/football" className="hover:underline">Football</Link>{" / "}<span>Seasons</span></nav>
      <FootballHubNav current="seasons" />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Club Football by Season</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">Each completed season as a full hub: the club power ranking (with trophy bonuses), UEFA country coefficients, the European and continental competitions, every final domestic table, and every cup result.</p>
      </header>
      <SeasonTrends data={trends} />
      <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Browse a season</h2>
      <div className="space-y-2.5">
        {Array.from(new Set(SEASONS.map((s) => Math.floor(+s.slug.slice(0, 4) / 10) * 10))).sort((a, b) => b - a).map((dec) => (
          <div key={dec} className="flex items-baseline gap-3">
            <div className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5">{dec}s</div>
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.filter((s) => Math.floor(+s.slug.slice(0, 4) / 10) * 10 === dec).map((s) => (
                <Link key={s.slug} href={`/teams/football/${s.slug}`} title={s.note}
                  className="text-xs px-2.5 py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5" style={cardStyle}>
                  {s.label}{s.live && <span className="text-[9px] px-1 py-px rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>LIVE</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
