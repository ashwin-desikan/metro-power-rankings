import type { Metadata } from "next";
import Link from "next/link";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import fs from "fs";
import path from "path";
import SeasonTrends, { type TrendsData } from "../SeasonTrends";
import SeasonSuperlatives from "../SeasonSuperlatives";

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
  { slug: "2015-16", label: "2015-16", note: "Champions League: Real Madrid" },
  { slug: "2014-15", label: "2014-15", note: "The treble: Barcelona" },
  { slug: "2013-14", label: "2013-14", note: "Champions League: Real Madrid · La Décima" },
  { slug: "2012-13", label: "2012-13", note: "Champions League: Bayern Munich · all-German final" },
  { slug: "2011-12", label: "2011-12", note: "Champions League: Chelsea" },
  { slug: "2010-11", label: "2010-11", note: "Champions League: Barcelona" },
  { slug: "2009-10", label: "2009-10", note: "Champions League: Internazionale · treble" },
  { slug: "2008-09", label: "2008-09", note: "Champions League: Barcelona · treble" },
  { slug: "2007-08", label: "2007-08", note: "Champions League: Manchester United" },
  { slug: "2006-07", label: "2006-07", note: "Champions League: AC Milan" },
  { slug: "2005-06", label: "2005-06", note: "Champions League: Barcelona · La Liga & Europe double" },
  { slug: "2004-05", label: "2004-05", note: "Champions League: Liverpool · the Miracle of Istanbul" },
  { slug: "2003-04", label: "2003-04", note: "Champions League: FC Porto · Valencia's La Liga & UEFA Cup double" },
  { slug: "2002-03", label: "2002-03", note: "Champions League: AC Milan · all-Italian final vs Juventus" },
  { slug: "2001-02", label: "2001-02", note: "Champions League: Real Madrid · La Novena, Zidane's volley" },
  { slug: "2000-01", label: "2000-01", note: "Champions League: Bayern Munich · UEFA Cup: Liverpool" },
  { slug: "1999-00", label: "1999-00", note: "Champions League: Real Madrid · first FIFA Club World Championship: Corinthians" },
  { slug: "1998-99", label: "1998-99", note: "The treble: Manchester United · last Cup Winners' Cup: Lazio" },
  { slug: "1997-98", label: "1997-98", note: "Champions League: Real Madrid · La Séptima" },
  { slug: "1996-97", label: "1996-97", note: "Champions League: Borussia Dortmund" },
  { slug: "1995-96", label: "1995-96", note: "Champions League: Juventus" },
  { slug: "1994-95", label: "1994-95", note: "Champions League: Ajax" },
  { slug: "1993-94", label: "1993-94", note: "Champions League: AC Milan · 4-0 in the final" },
  { slug: "1992-93", label: "1992-93", note: "Champions League: Marseille · the first Champions League" },
  { slug: "1991-92", label: "1991-92", note: "European Cup: FC Barcelona" },
  { slug: "1990-91", label: "1990-91", note: "European Cup: Red Star Belgrade" },
  { slug: "1989-90", label: "1989-90", note: "European Cup: AC Milan" },
  { slug: "1988-89", label: "1988-89", note: "European Cup: AC Milan" },
  { slug: "1987-88", label: "1987-88", note: "European Cup: PSV Eindhoven" },
  { slug: "1986-87", label: "1986-87", note: "European Cup: FC Porto" },
  { slug: "1985-86", label: "1985-86", note: "European Cup: Steaua Bucureşti" },
  { slug: "1984-85", label: "1984-85", note: "European Cup: Juventus" },
  { slug: "1983-84", label: "1983-84", note: "European Cup: Liverpool" },
  { slug: "1982-83", label: "1982-83", note: "European Cup: Hamburger SV" },
  { slug: "1981-82", label: "1981-82", note: "European Cup: Aston Villa" },
  { slug: "1980-81", label: "1980-81", note: "European Cup: Liverpool" },
  { slug: "1979-80", label: "1979-80", note: "European Cup: Nottingham Forest" },
  { slug: "1978-79", label: "1978-79", note: "European Cup: Nottingham Forest" },
  { slug: "1977-78", label: "1977-78", note: "European Cup: Liverpool" },
  { slug: "1976-77", label: "1976-77", note: "European Cup: Liverpool" },
  { slug: "1975-76", label: "1975-76", note: "European Cup: Bayern Munich" },
  { slug: "1974-75", label: "1974-75", note: "European Cup: Bayern Munich" },
  { slug: "1973-74", label: "1973-74", note: "European Cup: Bayern Munich" },
  { slug: "1972-73", label: "1972-73", note: "European Cup: Ajax" },
  { slug: "1971-72", label: "1971-72", note: "European Cup: Ajax" },
  { slug: "1970-71", label: "1970-71", note: "European Cup: Ajax" },
  { slug: "1969-70", label: "1969-70", note: "European Cup: Feyenoord" },
  { slug: "1968-69", label: "1968-69", note: "European Cup: AC Milan" },
  { slug: "1967-68", label: "1967-68", note: "European Cup: Manchester United" },
  { slug: "1966-67", label: "1966-67", note: "European Cup: Celtic" },
  { slug: "1965-66", label: "1965-66", note: "European Cup: Real Madrid" },
  { slug: "1964-65", label: "1964-65", note: "European Cup: Internazionale" },
  { slug: "1963-64", label: "1963-64", note: "European Cup: Internazionale" },
  { slug: "1962-63", label: "1962-63", note: "European Cup: AC Milan" },
  { slug: "1961-62", label: "1961-62", note: "European Cup: Benfica" },
  { slug: "1960-61", label: "1960-61", note: "European Cup: Benfica" },
  { slug: "1959-60", label: "1959-60", note: "European Cup: Real Madrid" },
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
      <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Browse a season</h2>
      {/* Decade = the season's END year, so 2019-20 (ends 2020) sits in the 2020s and every
          decade row starts with the season ending in a multiple of ten. */}
      <div className="space-y-2.5">
        {Array.from(new Set(SEASONS.map((s) => Math.floor((+s.slug.slice(0, 4) + 1) / 10) * 10))).sort((a, b) => b - a).map((dec) => (
          <div key={dec} className="flex items-baseline gap-3">
            <div className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5">{dec}s</div>
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.filter((s) => Math.floor((+s.slug.slice(0, 4) + 1) / 10) * 10 === dec).map((s) => (
                <Link key={s.slug} href={`/teams/football/${s.slug}`} title={s.note}
                  className="text-xs px-2.5 py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5" style={cardStyle}>
                  {s.label}{s.live && <span className="text-[9px] px-1 py-px rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>LIVE</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8"><SeasonTrends data={trends} /></div>
      <SeasonSuperlatives data={trends} />
    </main>
  );
}
