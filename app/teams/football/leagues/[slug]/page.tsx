import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllLeagueHubSlugs,
  getLeagueHub,
  getAllClubs,
  monogramForFootball,
  type FootballLeagueHub,
} from "@/lib/football";
import LeagueHubMap, { type HubClub } from "./LeagueHubMap";
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
    description: `${h.league} (${h.country}): current-season standings and complete all-time Level 1 champions list.`,
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

  // All in-scope clubs for this hub's country, slimmed to the fields the
  // map needs. tier_by_year drives the year filter and tier coloring.
  const hubClubs: HubClub[] = getAllClubs()
    .filter((c) => c.country === hub.country)
    .map((c) => ({
      slug: c.slug,
      cur_name: c.cur_name,
      metro: c.metro,
      lat: c.lat,
      lng: c.lng,
      first_year: c.first_year,
      last_year: c.last_year,
      tier_by_year: c.tier_by_year ?? {},
    }));

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
          {hub.country} Level 1 (top-flight) history.
        </p>
      </header>

      <CurrentStandings hub={hub} />
      <LeagueHubMap country={hub.country} clubs={hubClubs} />
      <AllTimeChampions hub={hub} />
    </main>
  );
}

function ColorBall({ slug, name }: { slug: string; name: string }) {
  const m = monogramForFootball(name, slug);
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{
        background: m.bg,
        color: m.fg,
        width: 22,
        height: 22,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {m.mono}
    </span>
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
              <th
                className="py-2 pl-3 text-left font-medium whitespace-nowrap"
                title="European competition the club qualified for next season"
              >
                Eur Qual <span className="text-[var(--text-dim)] normal-case font-normal">(next yr)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {hub.current_standings.map((s) => {
              const isChamp = s.champion === true || s.place === 1;
              return (
              <tr key={s.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums">{s.place ?? "-"}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <ColorBall slug={s.slug} name={s.cur_name} />
                    <Link href={`/teams/football/${s.slug}`} className="hover:underline font-medium">
                      {s.cur_name}
                    </Link>
                    {isChamp && (
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}
                        title="League champion this season"
                      >
                        Champion
                      </span>
                    )}
                    {s.promoted && (
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}
                        title="Promoted this season"
                      >
                        Promoted
                      </span>
                    )}
                    {s.relegated && (
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}
                        title="Relegated this season"
                      >
                        Relegated
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{s.matches ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.pts ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gf ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.ga ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
                <td className="py-1.5 pl-3 text-xs whitespace-nowrap">
                  {s.eur_qual && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 font-semibold tracking-wide"
                      style={{ background: "rgba(59,130,246,0.18)", color: "#3b82f6" }}
                      title="Qualified for this European competition next season"
                    >
                      {s.eur_qual}
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
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
        All-time Level 1 champions{" "}
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
              <li key={c.slug} className="flex items-center justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
                <span className="inline-flex items-center gap-2">
                  <ColorBall slug={c.slug} name={c.name} />
                  <Link href={`/teams/football/${c.slug}`} className="hover:underline">{c.name}</Link>
                </span>
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
        <h3 className="text-sm font-semibold mb-2">Chronological (most recent first)</h3>
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
              {[...hub.all_time_champions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).map((ch, i, arr) => {
                // Era break marker fires at the boundary between modern
                // and legacy league names, regardless of sort direction.
                const showBreak = breakYear && ch.year === breakYear &&
                  (i === 0 || arr[i - 1].year !== breakYear);
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
                        <span className="inline-flex items-center gap-2">
                          <ColorBall slug={ch.champion_slug} name={ch.champion} />
                          <Link href={`/teams/football/${ch.champion_slug}`} className="hover:underline font-medium">
                            {ch.champion}
                          </Link>
                        </span>
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
