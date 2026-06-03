import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import { getWClubs, getWMeta, getWTournamentCompetitions, getWLeagueHubs, decoratedRows, WCOLS_DEFAULT, getWClubByName } from "@/lib/wfootball";
import { getWWCMeta, getWWCNations } from "@/lib/wnational";
import { getNwslStandings } from "@/lib/nwsl-standings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import MostDecoratedClubsTable from "@/app/teams/wfootball/MostDecoratedClubsTable";

const PAGE_PATH = "/teams/wfootball";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Women's Football";
const PAGE_DESCRIPTION =
  "Women's football honors in one place: the FIFA Women's World Cup, the UEFA Women's Champions League and FIFA Women's Champions Cup, and the domestic league hubs of England (WSL, Women's FA Cup), the United States (NWSL Championship and Shield), and Spain (Liga F), with per-nation and per-club pages.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default async function WFootballHubPage() {
  const tournaments = getWTournamentCompetitions();
  const leagueHubs = getWLeagueHubs();
  const clubs = getWClubs();
  const meta = getWMeta();
  const rows = decoratedRows(clubs.slice(0, 25));
  const wwc = getWWCMeta();
  const wwcTop = getWWCNations()[0];
  const nwsl = await getNwslStandings();
  const nwslAsOf = new Date(nwsl.fetched_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const nwslRows = nwsl.rows.map((r) => ({ ...r, slug: getWClubByName(r.name)?.slug ?? null }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">All Sports</Link>
        {" / "}
        <span>Women&apos;s Football</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Women&apos;s football across three layers. International tournament hubs cover national-team
          competitions led by the FIFA Women&apos;s World Cup. Club tournament hubs carry every UEFA
          Women&apos;s Champions League and FIFA Women&apos;s Champions Cup edition. And league hubs group
          each country&apos;s domestic competitions: England&apos;s WSL and Women&apos;s FA Cup, the United
          States&apos; NWSL Championship and Shield, and Spain&apos;s Liga F. Per-nation and per-club pages
          carry the full honors record.
        </p>
      </header>

      <HubNav
        items={[
          { label: "International", href: "#international" },
          { label: "Club Tournaments", href: "#club-tournaments" },
          { label: "League Hubs", href: "#leagues" },
          { label: "NWSL Standings", href: "#standings" },
        ]}
      />

      <section className="mb-10">
        <h2 id="international" className="text-lg font-semibold mb-3">International tournament hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link href="/teams/national/womens-world-cup" className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold">FIFA Women&apos;s World Cup</div>
              <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold" style={{ background: "rgba(168,85,247,0.16)", color: "#a855f7" }}>National teams</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
              {wwc.editions} editions{wwc.year_min && wwc.year_max ? <> · {wwc.year_min}–{wwc.year_max}</> : null}
            </div>
            {wwcTop && (
              <div className="text-xs text-[var(--text-muted)] mt-2">
                Most titled: <span className="font-medium text-[var(--text)]">{wwcTop.name}</span> ({wwcTop.titles})
              </div>
            )}
          </Link>
        </div>
      </section>

      <section className="mb-10">
        <h2 id="club-tournaments" className="text-lg font-semibold mb-3">European &amp; world club tournament hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tournaments.map((c) => {
            const top = c.most_decorated[0];
            return (
              <Link key={c.slug} href={`/teams/wfootball/${c.slug}`} className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{c.short_label}</div>
                  <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold" style={{ background: "rgba(16,185,129,0.16)", color: "#10b981" }}>{c.region}</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {c.editions} edition{c.editions === 1 ? "" : "s"}
                  {c.year_min && c.year_max ? <> · {c.year_min}–{c.year_max}</> : null}
                </div>
                {top && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Most titled: <span className="font-medium text-[var(--text)]">{top.cur_name}</span> ({top.champion_count})
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 id="leagues" className="text-lg font-semibold mb-3">League hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {leagueHubs.map((h) => {
            const top = h.most_decorated[0];
            return (
              <Link key={h.slug} href={`/teams/wfootball/leagues/${h.slug}`} className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <div className="text-base font-semibold">{h.country}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">{h.competitions.map((c) => c.short_label).join(" · ")}</div>
                {top && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    Most titled: <span className="font-medium text-[var(--text)]">{top.name}</span> ({top.titles})
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {nwsl.rows.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-1">
            <h2 id="standings" className="text-lg font-semibold">{nwsl.source_label} standings</h2>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={{ background: "rgba(16,185,129,0.16)", color: "#10b981" }}>Live · ESPN</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">Current as of {nwslAsOf}, via ESPN (refreshed hourly).</p>
          <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 pr-2 pl-3 text-right font-medium w-8">#</th>
                  <th className="py-2 px-2 text-left font-medium">Club</th>
                  <th className="py-2 px-2 text-right font-medium">P</th>
                  <th className="py-2 px-2 text-right font-medium">W</th>
                  <th className="py-2 px-2 text-right font-medium">D</th>
                  <th className="py-2 px-2 text-right font-medium">L</th>
                  <th className="py-2 px-2 text-right font-medium hidden sm:table-cell">GF</th>
                  <th className="py-2 px-2 text-right font-medium hidden sm:table-cell">GA</th>
                  <th className="py-2 px-2 text-right font-medium hidden sm:table-cell">GD</th>
                  <th className="py-2 px-3 text-right font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {nwslRows.map((r, i) => (
                  <tr key={(r.slug ?? r.name) + i} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-2 pl-3 text-right text-[var(--text-dim)]">{i + 1}</td>
                    <td className="py-1.5 px-2">{r.slug ? <Link href={`/teams/wfootball/clubs/${r.slug}`} className="hover:underline font-medium">{r.name}</Link> : <span className="font-medium">{r.name}</span>}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.played}</td>
                    <td className="py-1.5 px-2 text-right">{r.wins}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.draws}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.losses}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell">{r.gf}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell">{r.ga}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell">{r.gd > 0 ? "+" : ""}{r.gd}</td>
                    <td className="py-1.5 px-3 text-right font-semibold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <MostDecoratedClubsTable
        title="Most decorated clubs"
        caption={`Total major honors across all tracked club competitions. ${meta.clubs_with_metro} of ${meta.clubs} clubs link to their metro area. Click any column to sort.`}
        rows={rows}
        columns={WCOLS_DEFAULT}
      />
    </main>
  );
}
