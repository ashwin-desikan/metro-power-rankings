import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllTournamentHubSlugs,
  getTournamentHub,
  type TournamentHub,
} from "@/lib/international";
import { flagForTeam, flagCdnUrl, displayNameForTeam } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

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
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
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

  const navItems = [
    ...(hub.most_decorated.length > 0 ? [{ label: "Most Decorated", href: "#most-decorated" }] : []),
    { label: "All-Time Champions", href: "#champions" },
  ];

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

      {navItems.length > 1 && <HubNav items={navItems} />}
      <div id="most-decorated">
        <MostDecorated hub={hub} />
      </div>
      <div id="champions">
        <ChampionsList hub={hub} />
      </div>
      {hub.slug === "other-tournaments" && <BhcLinkCard />}
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
              {d.slug && flagCdnUrl(d.slug) && (
                <img src={flagCdnUrl(d.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />
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
  // Index finalists by year for "vs runner-up" rendering. Intercontinental
  // and Other hubs need to match on (year, tournament_label) because a single
  // year can hold multiple distinct competitions (e.g., 2021 had both the
  // UEFA Nations League Finals and the CONCACAF Nations League Finals).
  const showTournamentColumn = hub.category === "INTER" || hub.category === "OTHER";
  const finalistKey = (year: number, label: string | null) =>
    showTournamentColumn ? `${year}|${label ?? ""}` : `${year}`;
  const finalistByKey = new Map<string, typeof hub.finalists>();
  for (const f of hub.finalists) {
    const k = finalistKey(f.year, f.tournament_label);
    if (!finalistByKey.has(k)) finalistByKey.set(k, []);
    finalistByKey.get(k)!.push(f);
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
        {showTournamentColumn && (
          <> The Tournament column names the specific competition since this hub aggregates
          multiple distinct events.</>
        )}
      </p>
      {/* Mobile: one card per edition instead of a 3-4 column table that
          forces sideways scrolling at phone widths. Same `hub.champions`
          data as the desktop table below - only the presentation differs. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="champions"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={hub.champions.map((c, i) => {
          const finalists = finalistByKey.get(finalistKey(c.year, c.tournament_label)) ?? [];
          return (
            <div
              key={i}
              className="rounded-lg border p-3"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight flex items-center gap-1.5 flex-wrap font-medium text-sm">
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                    style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
                    title={`${hub.label} ${c.year} champion`}
                  >
                    <span aria-hidden>★</span>
                  </span>
                  {c.champion_slug && flagCdnUrl(c.champion_slug) && (
                    <img src={flagCdnUrl(c.champion_slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />
                  )}
                  {c.champion_slug ? (
                    <Link href={`/teams/national/${c.champion_slug}`} className="hover:text-[var(--accent)] hover:underline">
                      {displayNameForTeam(c.champion_slug, c.champion_cur_name)}
                    </Link>
                  ) : (
                    <span>{c.champion_cur_name}</span>
                  )}
                  {c.champion_as && (
                    <span className="text-[var(--text-muted)] text-xs">(as {c.champion_as})</span>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{c.year}</span>
              </div>
              {showTournamentColumn && (
                <div className="text-[11px] text-[var(--text-dim)] mt-0.5">
                  {c.tournament_label ?? "—"}
                </div>
              )}
              <div className="grid grid-cols-1 gap-1.5 text-xs mt-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner(s)-up</div>
                  <div className="text-[var(--text-muted)]">
                    {finalists.length === 0 ? (
                      <span className="text-[var(--text-dim)]">—</span>
                    ) : (
                      finalists.map((f, fi) => (
                        <span key={fi}>
                          {fi > 0 && ", "}
                          {f.slug && flagCdnUrl(f.slug) && (
                            <img src={flagCdnUrl(f.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block mr-1" loading="lazy" decoding="async" />
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
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        />
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Year</th>
              {showTournamentColumn && (
                <th className="py-2 text-left font-medium">Tournament</th>
              )}
              <th className="py-2 text-left font-medium">Champion</th>
              <th className="py-2 text-left font-medium">Runner(s)-up</th>
            </tr>
          </thead>
          <tbody>
            {hub.champions.map((c, i) => {
              const finalists = finalistByKey.get(finalistKey(c.year, c.tournament_label)) ?? [];
              return (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 tabular-nums">{c.year}</td>
                  {showTournamentColumn && (
                    <td className="py-1.5 text-[var(--text)]">
                      {c.tournament_label ?? <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  )}
                  <td className="py-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide mr-2"
                      style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
                      title={`${hub.label} ${c.year} champion`}
                    >
                      <span aria-hidden>★</span>
                    </span>
                    {c.champion_slug && flagCdnUrl(c.champion_slug) && (
                      <img src={flagCdnUrl(c.champion_slug)!} alt="" aria-hidden width={20} height={15} className="inline-block mr-1.5" loading="lazy" decoding="async" />
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
                          {f.slug && flagCdnUrl(f.slug) && (
                            <img src={flagCdnUrl(f.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block mr-1" loading="lazy" decoding="async" />
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

function BhcLinkCard() {
  return (
    <section className="mt-4">
      <h2 className="text-base font-semibold mb-2">British Home Championship &amp; Rous Cup</h2>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        The British Home Championship (1884–1984) and its successor the Rous Cup (1985–1989) are
        archived separately. Results are not counted toward any team&apos;s main honors totals.
      </p>
      <Link
        href="/teams/national/tournaments/british-home-championship"
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        View British Home Championship &amp; Rous Cup results →
      </Link>
    </section>
  );
}
