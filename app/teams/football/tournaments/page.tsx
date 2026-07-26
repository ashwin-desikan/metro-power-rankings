import type { Metadata } from "next";
import Link from "next/link";
import { getAllEuropeanTournamentHubs } from "@/lib/football";
import { leagueStatusFor } from "@/lib/leagueStatus";
import FootballHubNav from "@/app/teams/FootballHubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Hourly ISR so the auto month-window competition statuses flip without a deploy.
export const revalidate = 3600;

const PAGE_PATH = "/teams/football/tournaments";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "European & World Club Tournaments";
const PAGE_DESCRIPTION =
  "Hubs for the UEFA Champions League, Europa League, Conference League, Cup Winners' Cup, Inter-Cities Fairs Cup, UEFA Super Cup, and Club World Cup. All-time champions, finalists, and most decorated clubs.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function ClubTournamentsIndexPage() {
  const hubs = getAllEuropeanTournamentHubs();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Club Football</Link>
        {" / "}
        <span>Tournaments</span>
      </nav>

      <FootballHubNav current="competitions" />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">European & World Club Tournaments</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Hubs for UEFA&apos;s three current European competitions plus the defunct Cup Winners&apos;
          Cup and Inter-Cities Fairs Cup, the UEFA Super Cup, and the FIFA Club World Cup /
          Intercontinental Cup lineage. Each hub lists all-time champions, finalists, and the most
          decorated clubs, with a live 2025-26 bracket on competitions still in progress.
        </p>
      </header>

      <section className="mb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hubs.map((h) => {
            const topClub = h.most_decorated[0];
            const seasonal = leagueStatusFor(`/teams/football/tournaments/${h.slug}`);
            const isLive = (seasonal != null && seasonal.tone !== "offseason") || (h.active && h.current_entries.length > 0);
            return (
              <Link
                key={h.slug}
                href={`/teams/football/tournaments/${h.slug}`}
                className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{h.short_label}</div>
                  {!h.active && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                      style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
                    >
                      Defunct
                    </span>
                  )}
                  {h.active && isLive && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                      style={{ background: "rgba(16,185,129,0.18)", color: "#10b981" }}
                    >
                      Live
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {h.editions} edition{h.editions === 1 ? "" : "s"}
                  {h.year_min && h.year_max ? <> · {h.year_min}–{h.year_max}</> : null}
                </div>
                {topClub && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Most titled: <span className="font-medium text-[var(--text)]">{topClub.cur_name}</span> ({topClub.champion_count})
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
