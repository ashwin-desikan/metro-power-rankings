import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllTournamentHubSlugs,
  getTournamentHub,
  type TournamentHub,
} from "@/lib/international";
import { flagForTeam, displayNameForTeam } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllTournamentHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = getTournamentHub(slug);
  if (!hub) return { title: "Tournament not found" };
  return {
    title: hub.label,
    description: `${hub.label} all-time champions, finalists, and most decorated national teams from ${hub.year_min} to ${hub.year_max}.`,
    alternates: { canonical: `/teams/national/tournaments/${hub.slug}` },
    openGraph: {
      title: `${hub.label} | ${SITE_NAME}`,
      description: `${hub.label} history: all-time champions and most decorated teams.`,
      url: `${BASE_URL}/teams/national/tournaments/${hub.slug}`,
      type: "website",
    },
  };
}

export default async function TournamentHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getTournamentHub(slug);
  if (!hub) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/national"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Football
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/national" className="hover:underline">International Football</Link>
        {" / "}
        <span>{hub.label}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.label}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {hub.editions} edition{hub.editions === 1 ? "" : "s"} on file
          {hub.year_min && hub.year_max && hub.year_min !== hub.year_max
            ? <> from {hub.year_min} to {hub.year_max}</>
            : hub.year_min
              ? <> in {hub.year_min}</>
              : null}
          .
        </p>
      </header>

      <MostDecorated hub={hub} />
      <ChampionsList hub={hub} />
    </main>
  );
}

function MostDecorated({ hub }: { hub: TournamentHub }) {
  if (hub.most_decorated.length === 0) return null;
  const top = hub.most_decorated.slice(0, 12);
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Most decorated</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Teams ranked by total {hub.label} titles, with the year of the most recent win.
      </p>
      <ul className="mt-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {top.map((d) => (
          <li
            key={d.cur_name}
            className="flex items-center justify-between border-b py-1"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              {d.slug && flagForTeam(d.slug) && (
                <span aria-hidden>{flagForTeam(d.slug)}</span>
              )}
              {d.slug ? (
                <Link href={`/teams/national/${d.slug}`} className="hover:underline">
                  {displayNameForTeam(d.slug, d.cur_name)}
                </Link>
              ) : (
                <>{d.cur_name}</>
              )}
            </span>
            <span className="text-[var(--text-muted)] tabular-nums">
              {d.champion_count}
              <span className="text-xs ml-1.5">last {d.last_won}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChampionsList({ hub }: { hub: TournamentHub }) {
  if (hub.champions.length === 0) return null;
  // Index finalists by year for "vs runner-up" rendering.
  const finalistByYear = new Map<number, typeof hub.finalists>();
  for (const f of hub.finalists) {
    if (!finalistByYear.has(f.year)) finalistByYear.set(f.year, []);
    finalistByYear.get(f.year)!.push(f);
  }
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">All-time champions</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent first. Each edition&apos;s champion is listed; runners-up appear where the
        workbook records the losing finalist.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Year</th>
              <th className="py-2 text-left font-medium">Champion</th>
              <th className="py-2 text-left font-medium">Runner(s)-up</th>
            </tr>
          </thead>
          <tbody>
            {hub.champions.map((c, i) => {
              const finalists = finalistByYear.get(c.year) ?? [];
              return (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 tabular-nums">{c.year}</td>
                  <td className="py-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide mr-2"
                      style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
                      title={`${hub.label} ${c.year} champion`}
                    >
                      <span aria-hidden>★</span>
                    </span>
                    {c.champion_slug && flagForTeam(c.champion_slug) && (
                      <span className="mr-1.5" aria-hidden>{flagForTeam(c.champion_slug)}</span>
                    )}
                    {c.champion_slug ? (
                      <Link href={`/teams/national/${c.champion_slug}`} className="hover:underline font-medium">
                        {displayNameForTeam(c.champion_slug, c.champion_cur_name)}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.champion_cur_name}</span>
                    )}
                    {c.champion_as && (
                      <span className="text-[var(--text-muted)] text-xs ml-1.5">(as {c.champion_as})</span>
                    )}
                  </td>
                  <td className="py-1.5 text-[var(--text-muted)] text-xs">
                    {finalists.length === 0 ? (
                      <span className="text-[var(--text-dim)]">—</span>
                    ) : (
                      finalists.map((f, fi) => (
                        <span key={fi}>
                          {fi > 0 && ", "}
                          {f.slug && flagForTeam(f.slug) && (
                            <span className="mr-1" aria-hidden>{flagForTeam(f.slug)}</span>
                          )}
                          {f.slug ? (
                            <Link href={`/teams/national/${f.slug}`} className="hover:underline">
                              {displayNameForTeam(f.slug, f.cur_name)}
                            </Link>
                          ) : (
                            f.cur_name
                          )}
                        </span>
                      ))
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
