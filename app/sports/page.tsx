import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import SportsMapToggle from "./SportsMapToggle";
import SportsLiveBoard from "./SportsLiveBoard";
import { type TeamMarker } from "./SportsExplorer";
import { leagueStatusFor, clubFootballStatus } from "@/lib/leagueStatus";
import { catalogByFamily } from "@/lib/sportsCatalog";

const PAGE_PATH = "/sports";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Zone Zero Sports Hub";
const PAGE_DESCRIPTION =
  "Citizen of Nowhere's sports hub: every league, national team, and cross-sport index in one place — the Zone Zero Cup, live standings, champions, valuations, rivalries, and the greatest games, plus the whole world on a map.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

type Summary = { major_markers: number; other_markers: number; markers_with_team_page: number; league_cards: { page: string | null; team_count: number }[] };
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "sports", rel), "utf8")) as T;
}

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

type Feature = { emoji: string; title: string; href: string; desc: string };
const FEATURES: Feature[] = [
  { emoji: "📊", title: "Live Standings", href: "/sports/standings", desc: "Every in-season league table on Earth, refreshed live and grouped by sport." },
  { emoji: "👑", title: "Current Champions", href: "/sports/champions", desc: "Who holds every trophy right now, across every sport we track." },
  { emoji: "🎬", title: "The Greatest Games", href: "/sports/games", desc: "The highest Game Scores ever recorded, ranked within and across sports." },
  { emoji: "⚔️", title: "Sports Rivalries", href: "/sports/rivalries", desc: "The derbies, classics and grudge matches that define cities and nations." },
  { emoji: "💰", title: "Team Valuations", href: "/sports/valuations", desc: "What every franchise is worth, league by league, on one sortable board." },
  { emoji: "👻", title: "The Geography of Erasure", href: "/sports/geography-of-erasure", desc: "Ghost franchises: the champions erased when the metro behind them was outgrown." },
  { emoji: "🏙️", title: "The Team That Wins the City", href: "/top-teams", desc: "One defining club per metro — the one whose loss would change what the metro is." },
];

export default function SportsPage() {
  const teams = loadJson<TeamMarker[]>("all-teams.json");
  const summary = loadJson<Summary>("league-summary.json");
  const allGroups = catalogByFamily(true);
  const sportCount = allGroups.length;
  const hubCount = allGroups.flatMap((g) => g.entries).length;
  const liveCount = catalogByFamily(false)
    .flatMap((g) => g.entries)
    .filter((e) => { const s = e.href === "/teams/football" ? clubFootballStatus() : leagueStatusFor(e.href); return !!s && s.tone !== "offseason"; })
    .length;

  const ld = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: PAGE_TITLE, description: PAGE_DESCRIPTION, url: PAGE_URL,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER }, author: AUTHOR,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>&larr; Back to rankings</Link>
          <Link href="/geography" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>Geography hub &rarr;</Link>
          <Link href="/sound" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={mono}>Sound hub &rarr;</Link>
        </nav>

        {/* Bold hero */}
        <header className="mb-8 border-b border-[var(--border)] pb-8">
          <div className="flex items-center gap-3 mb-4">
            <img src="/zone-zero-seal.svg" alt="" width={52} height={52} style={{ flexShrink: 0 }} />
            <p className="text-xs tracking-widest text-[var(--text-muted)]" style={mono}>CITIZEN OF NOWHERE&rsquo;S</p>
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: "clamp(34px, 6vw, 60px)", lineHeight: 1.02 }}>
            Zone Zero Sports.
          </h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
            Every league, every national team, and every game that matters — ranked against the metro behind it, not the
            trophy cabinet. One hub for the whole world of sport, from the Zone Zero Cup to tonight&rsquo;s standings.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] mt-5" style={mono}>
            <div><strong className="text-[var(--text)]">{sportCount}</strong> sports</div>
            <div><strong className="text-[var(--text)]">{hubCount}</strong> league &amp; nation hubs</div>
            <div><strong style={{ color: "#10b981" }}>{liveCount}</strong> live right now</div>
            <Link href="/sports/about" className="hover:text-[var(--accent)] transition-colors">What Zone Zero is &rarr;</Link>
          </div>
        </header>

        <HubNav items={[
          { label: "The live board", href: "#live" },
          { label: "Indices & features", href: "#indices" },
          { label: "The map", href: "#map" },
        ]} />

        {/* The Live Hub — every league, live status at a glance */}
        <section id="live" className="mb-12 scroll-mt-24">
          <div className="mb-4">
            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...mono, color: "#10b981" }}>🟢 The live board</p>
            <h2 className="text-2xl font-bold mb-2">Every league, live at a glance</h2>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">The full directory of league and national-team hubs, colour-coded by season. Green is in season, amber is playoffs, purple is the World Cup.</p>
          </div>
          <SportsLiveBoard />
        </section>

        {/* Indices & features */}
        <section id="indices" className="mb-12 scroll-mt-24">
          <div className="mb-5">
            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...mono, color: "var(--accent)" }}>Indices & features</p>
            <h2 className="text-2xl font-bold mb-2">The cross-sport lenses</h2>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">The rankings and deep dives that cut across every sport at once.</p>
          </div>

          <Link href="/sports/zone-zero-cup" className="group block rounded-xl border p-6 mb-4 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: "4px", borderLeftColor: "#d4af37" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ ...mono, color: "#d4af37", background: "rgba(212,175,55,0.16)" }}>The flagship index</span>
            </div>
            <h3 className="text-2xl font-bold mb-1 flex items-center gap-2"><span aria-hidden>🏆</span> The Zone Zero Cup</h3>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
              National sporting merit across fourteen pillars and every sport, on one index, with a ten-year half-life so
              recent glory counts most. Two hundred nations, ranked head to head.
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs" style={{ ...mono, color: "var(--accent)" }}>Open the Cup <span aria-hidden>→</span></span>
          </Link>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {FEATURES.map((f) => (
              <Link key={f.href} href={f.href} className="flex flex-col gap-2 p-5 rounded-lg border transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none" aria-hidden>{f.emoji}</span>
                  <h3 className="text-base font-bold">{f.title}</h3>
                </div>
                <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* The map — collapsed by default */}
        <section id="map" className="mb-8 scroll-mt-24">
          <div className="mb-4">
            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...mono, color: "var(--accent)" }}>The map</p>
            <h2 className="text-2xl font-bold mb-2">Every top-flight team on Earth</h2>
            <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">The whole world of sport as one interactive map. Open it when you want to explore geographically.</p>
          </div>
          <SportsMapToggle teams={teams} majorCount={summary.major_markers} otherCount={summary.other_markers} />
        </section>

        <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-3xl">
          Every team is placed on the metro behind it and ranked against that metro&rsquo;s Power Score, not its trophy
          count. <Link href="/methodology" className="underline hover:text-[var(--accent)]">How the scores are built &rarr;</Link>
        </p>
      </main>
    </>
  );
}
