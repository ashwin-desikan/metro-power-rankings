import type { Metadata } from "next";
import Link from "next/link";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

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
];
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

export default function SeasonsIndex() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4"><Link href="/" className="hover:underline">Home</Link>{" / "}<Link href="/teams/football" className="hover:underline">Football</Link>{" / "}<span>Seasons</span></nav>
      <FootballHubNav current="seasons" />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Club Football by Season</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">Each completed season as a full hub: the club power ranking (with trophy bonuses), UEFA country coefficients, the European and continental competitions, every final domestic table, and every cup result.</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SEASONS.map((s) => (
          <Link key={s.slug} href={`/teams/football/${s.slug}`} className="rounded-xl border p-4 transition hover:border-[var(--accent)]" style={cardStyle}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold">{s.label}</span>
              {s.live && <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>LIVE</span>}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{s.note}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
