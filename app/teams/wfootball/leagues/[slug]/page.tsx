import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllWLeagueHubSlugs, getWLeagueHub, getWLeagueHubClubs, decoratedRows, columnsForHub } from "@/lib/wfootball";
import { getWLiveLeagueForHub, getWLiveOdds } from "@/lib/wLive";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import MostDecoratedClubsTable from "@/app/teams/wfootball/MostDecoratedClubsTable";
import WLiveTable from "@/app/teams/wfootball/WLiveTable";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllWLeagueHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = getWLeagueHub(slug);
  if (!hub) return { title: "League hub not found" };
  const comps = hub.competitions.map((c) => c.short_label).join(", ");
  const desc = `Women's club football in ${hub.country}: ${comps}. All-time champions, finals, and the most decorated clubs.`;
  return {
    title: `Women's Football: ${hub.country}`,
    description: desc,
    alternates: { canonical: `/teams/wfootball/leagues/${hub.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `Women's Football: ${hub.country} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wfootball/leagues/${hub.slug}`, type: "website" },
  };
}

export default async function WLeagueHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getWLeagueHub(slug);
  if (!hub) notFound();
  const top = hub.most_decorated[0];
  const rows = decoratedRows(getWLeagueHubClubs(slug));
  const compsLabel = hub.competitions.map((c) => c.short_label).join(" and ");
  const live = await getWLiveLeagueForHub(slug);
  // Playoff odds where the league has a simulation (NWSL today). Keyed by
  // comp slug, so a hub whose league has none simply renders as before.
  const odds = live ? (await getWLiveOdds())[live.compSlug ?? ""] : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/wfootball" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to Women&apos;s Football
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">All Sports</Link>
        {" / "}
        <Link href="/teams/wfootball" className="hover:underline">Women&apos;s Football</Link>
        {" / "}
        <span>{hub.country}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.country}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">
          Women&apos;s club competitions in {hub.country}: {hub.competitions.map((c) => c.short_label).join(", ")}.
          {top ? <> Most decorated: <span className="text-[var(--text)] font-medium"><CrestIcon name={top.name} size={18} className="mr-1.5 align-middle" />{top.name}</span> ({top.titles}).</> : null}
        </p>
      </header>

      {live && live.hasRows && (
        <section className="mb-8">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <h2 className="text-base font-semibold">{live.name} {live.seasonLabel} standings</h2>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
              style={live.placeholder
                ? { background: "rgba(148,163,184,0.18)", color: "#94a3b8" }
                : live.source === "ESPN"
                ? { background: "rgba(59,130,246,0.16)", color: "#3b82f6" }
                : { background: "rgba(16,185,129,0.16)", color: "#10b981" }}>
              {live.placeholder ? "Last season" : live.source === "ESPN" ? "Live · ESPN" : "Live · api-football"}
            </span>
          </div>
          {live.placeholder && (
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Showing the {live.seasonLabel} table until the 2026-27 season is published; it swaps automatically once the new season appears.
            </p>
          )}
          <div className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <WLiveTable
              groups={live.groups}
              odds={odds ? new Map(Object.entries(odds.rows)) : null}
              playoffSpots={odds?.spots}
              oddsLabels={odds?.labels}
            />
            {odds && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Green marks the {odds.spots} playoff places. Odds are simulated daily from the
                remaining schedule.
              </p>
            )}
          </div>
        </section>
      )}

      <section id="champions" className="mb-10 scroll-mt-20">
        <h2 className="text-base font-semibold mb-3">Competitions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hub.competitions.map((c) => {
            const cur = c.current;
            return (
              <Link key={c.slug} href={`/teams/wfootball/${c.slug}`} className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{c.short_label}</div>
                  <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold" style={{ background: c.kind === "cup" ? "rgba(37,99,235,0.16)" : "rgba(202,138,4,0.16)", color: c.kind === "cup" ? "#2563eb" : "#ca8a04" }}>{c.kind === "cup" ? "Cup" : "League"}</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {c.editions} edition{c.editions === 1 ? "" : "s"}
                  {c.year_min && c.year_max ? <> · {c.year_min}–{c.year_max}</> : null}
                </div>
                {cur && cur.decided && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    {cur.year} champion: <span className="font-medium text-[var(--text)]"><CrestIcon name={cur.champion} size={18} className="mr-1.5 align-middle" />{cur.champion}</span>
                  </div>
                )}
                {cur && !cur.decided && (
                  <div className="text-xs text-[var(--text-dim)] mt-2">{cur.year} to be decided</div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <MostDecoratedClubsTable
        title={`Most decorated in ${hub.country}`}
        caption={`Clubs with a final in ${compsLabel}, with their full honors breakdown. Click any column to sort.`}
        rows={rows}
        columns={columnsForHub(slug)}
      />
    </main>
  );
}
