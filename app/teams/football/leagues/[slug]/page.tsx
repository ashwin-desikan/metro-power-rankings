import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllLeagueHubSlugs,
  getLeagueHub,
  type FootballLeagueHub,
} from "@/lib/football";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllLeagueHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const h = getLeagueHub(slug);
  if (!h) return { title: "League not found" };
  return {
    title: h.league,
    description: `${h.league} (${h.country}): current-season standings and complete all-time top-flight champions list.`,
    alternates: { canonical: `/teams/football/leagues/${h.slug}` },
    openGraph: {
      title: `${h.league} | ${SITE_NAME}`,
      description: `${h.league} (${h.country}) current standings and all-time champions.`,
      url: `${BASE_URL}/teams/football/leagues/${h.slug}`,
      type: "website",
    },
  };
}

export default async function FootballLeagueHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getLeagueHub(slug);
  if (!hub) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>
        {" / "}
        <span>{hub.league}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.league}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {hub.country} top-flight history.
        </p>
      </header>

      <CurrentStandings hub={hub} />
      <AllTimeChampions hub={hub} />
    </main>
  );
}

function CurrentStandings({ hub }: { hub: FootballLeagueHub }) {
  if (hub.current_standings.length === 0) {
    return null;
  }
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        Current standings <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">({hub.current_year ? `season ending ${hub.current_year}` : "latest"})</span>
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Pos</th>
              <th className="py-2 text-left font-medium">Club</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pts</th>
              <th className="py-2 text-right font-medium">GF</th>
              <th className="py-2 text-right font-medium">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
            </tr>
          </thead>
          <tbody>
            {hub.current_standings.map((s) => (
              <tr key={s.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums">{s.place ?? "-"}</td>
                <td className="py-1.5">
                  <Link href={`/teams/football/${s.slug}`} className="hover:underline font-medium">
                    {s.cur_name}
                  </Link>
                </td>
                <td className="py-1.5 text-right tabular-nums">{s.matches ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.pts ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gf ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.ga ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AllTimeChampions({ hub }: { hub: FootballLeagueHub }) {
  // Tally champions by club for the summary block, then render the full list.
  const tally = new Map<string, { name: string; slug: string; count: number; last: number | null }>();
  for (const ch of hub.all_time_champions) {
    const k = ch.champion;
    const existing = tally.get(k);
    if (existing) {
      existing.count += 1;
      if (ch.year && (existing.last === null || ch.year > existing.last)) existing.last = ch.year;
    } else {
      tally.set(k, { name: ch.champion, slug: ch.champion_slug, count: 1, last: ch.year });
    }
  }
  const topClubs = [...tally.values()].sort((a, b) => b.count - a.count || (b.last ?? 0) - (a.last ?? 0));

  // Era break: Germany 1964 (Bundesliga founding) and Italy 1929 (Serie A founding)
  // and France 1933 (Division 1 founding) get a visual breakpoint inside the
  // chronological list. England has no real break (First Division → Premier League is
  // a rebrand, not a format change), so no marker needed.
  const eraBreakYear: Record<string, number> = {
    bundesliga: 1964,
    "serie-a": 1929,
    "ligue-1": 1933,
  };
  const breakYear = eraBreakYear[hub.slug];

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        All-time top-flight champions{" "}
        <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">
          ({hub.all_time_champions.length})
        </span>
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every Level-1 championship in {hub.country}, including pre-modern league formats.
        {breakYear && (
          <>
            {" "}A horizontal break marks {breakYear}, when {hub.league} consolidated to its modern format;
            earlier rows include national playoff and regional-knockout eras with multiple finalists per year.
          </>
        )}
      </p>

      {topClubs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Most decorated</h3>
          <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {topClubs.slice(0, 12).map((c) => (
              <li key={c.slug} className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
                <Link href={`/teams/football/${c.slug}`} className="hover:underline">{c.name}</Link>
                <span className="text-[var(--text-muted)] tabular-nums">
                  {c.count}
                  {c.last && <span className="text-xs ml-1.5">last {c.last}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">Chronological</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 text-left font-medium">Year</th>
                <th className="py-2 text-left font-medium">Champion</th>
                <th className="py-2 text-left font-medium">Competition</th>
              </tr>
            </thead>
            <tbody>
              {hub.all_time_champions.map((ch, i) => {
                const showBreak = breakYear && ch.year === breakYear &&
                  (i === 0 || hub.all_time_champions[i - 1].year !== breakYear);
                return (
                  <>
                    {showBreak && (
                      <tr key={`break-${ch.year}`} >
                        <td colSpan={3} className="py-3 text-center text-xs uppercase tracking-wider text-[var(--text-muted)]"
                            style={{ borderTop: "2px solid var(--border)", background: "var(--bg-subtle, transparent)" }}>
                          {hub.league} era begins
                        </td>
                      </tr>
                    )}
                    <tr key={`${ch.year}-${i}`} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 tabular-nums">{ch.year ?? "-"}</td>
                      <td className="py-1.5">
                        <Link href={`/teams/football/${ch.champion_slug}`} className="hover:underline font-medium">
                          {ch.champion}
                        </Link>
                        {ch.champion_team && ch.champion_team !== ch.champion && (
                          <span className="text-[var(--text-muted)] text-xs ml-2">as {ch.champion_team}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-[var(--text-muted)] text-xs">
                        {ch.league_name}
                        {ch.format === "playoff" && <span className="ml-2 italic">(playoff)</span>}
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
