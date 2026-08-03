import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllBaseballTeams, getBaseballHub } from "@/lib/baseball";
import { getNpbHub } from "@/lib/npb";
import { getCwsData } from "@/lib/cws";
import { flagCdnUrl } from "@/lib/international-display";
import { getWorldRanking } from "@/lib/worldRankings";
import WorldRankingSection from "@/app/teams/_shared/WorldRankingSection";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/baseball";
const TITLE = "International Baseball";
const DESC =
  "The complete World Baseball Classic: every edition since 2006, every game and final, the all-time table, and a page for each of the 23 nations to have played the tournament.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function BaseballHubPage() {
  const hub = getBaseballHub();
  const npb = getNpbHub();
  const cws = getCwsData();
  const teams = getAllBaseballTeams();
  if (!hub) return null;

  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const teamLink = (name: string, className?: string) => {
    const slug = slugByName.get(name);
    const flag = slug && flagCdnUrl(slug);
    return slug ? (
      <Link href={`/teams/baseball/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {flag && <img src={flag} alt="" aria-hidden width={20} height={15} className="inline-block mr-1 align-middle flex-shrink-0" loading="lazy" decoding="async" />}
        {name}
      </Link>
    ) : (
      <span className={className}>{name}</span>
    );
  };
  const allTime = [...teams].sort(
    (a, b) => b.titles - a.titles || b.w - a.w || a.name.localeCompare(b.name),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Baseball</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Baseball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The World Baseball Classic, complete: all {hub.editions.length} editions from the
          inaugural 2006 tournament through Venezuela&apos;s 2026 title, every one of the{" "}
          {hub.total_games} games on file, the all-time national table, and a page for each
          of the {hub.total_teams} nations to have played the tournament.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Champions", href: "#champions" },
          { label: "All-time Table", href: "#all-time" },
          { label: "World ranking", href: "#world-ranking" },
          { label: "Editions", href: "#editions" },
          { label: "Teams", href: "#teams" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- Domestic league hubs ---------------- */}
      <Link href="/teams/mlb"
        className="block rounded-xl border p-4 mb-4 transition hover:border-[var(--accent)]"
        style={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">Major League Baseball →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              North America&apos;s top league: every World Series champion, pennants, and the
              all-time record of all 30 franchises, by metro.
            </div>
          </div>
          <div className="text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            United States &amp; Canada
          </div>
        </div>
      </Link>

      {/* ---------------- NPB card ---------------- */}
      {npb ? (
        <Link href="/teams/baseball/npb"
          className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
          style={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-base">Nippon Professional Baseball →</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Japan&apos;s top league: every Japan Series champion since 1950, Central and
                Pacific pennants, and the all-time record of the 12 clubs.
              </div>
            </div>
            {npb.japan_series[0] ? (
              <div className="text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {npb.japan_series[0].year} Japan Series: {npb.japan_series[0].champion}
              </div>
            ) : null}
          </div>
        </Link>
      ) : null}

      {/* ---------------- College Baseball card ---------------- */}
      <Link href="/teams/baseball/college"
        className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
        style={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">College Baseball &rarr;</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              The College World Series: every champion and runner-up since {cws.first_year}, and an
              all-time table of CWS titles and trips to Omaha.
            </div>
          </div>
          {cws.champions[0] ? (
            <div className="text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {cws.champions[0].year} CWS: {cws.champions[0].champion}
            </div>
          ) : null}
        </div>
      </Link>

      {/* ---------------- Champions ---------------- */}
      <section className="mb-10">
        <h2 id="champions" className="text-lg font-semibold mb-1">World Baseball Classic finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Every championship game since 2006.</p>

        {/* Mobile: one card per final, same data as the table below */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {hub.finals.slice().reverse().map((f) => (
            <div key={f.year} className="rounded-lg border p-3" style={card}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm">{teamLink(f.champion)}</span>
                <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0" style={mono}>{f.year}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                  <div className="tabular-nums" style={mono}>{f.score}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                  <div>{teamLink(f.runner_up)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Venue</div>
                  <div className="text-[var(--text-muted)]">{f.venue}{f.city ? `, ${f.city}` : ""}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Venue</th>
              </tr>
            </thead>
            <tbody>
              {hub.finals.slice().reverse().map((f) => (
                <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                  <td className="py-2 px-3 font-semibold">{teamLink(f.champion)}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.score}</td>
                  <td className="py-2 px-3">{teamLink(f.runner_up)}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">
                    {f.venue}{f.city ? `, ${f.city}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- All-time table ---------------- */}
      <section className="mb-10">
        <h2 id="all-time" className="text-lg font-semibold mb-1">All-time table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every WBC game counted, ordered by titles then wins.
        </p>

        {/* Mobile: one card per nation, same data as the table below */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {allTime.map((t) => (
            <div key={t.slug} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{teamLink(t.name)}</span>
                <span
                  className="text-xs tabular-nums font-semibold flex-shrink-0"
                  style={{ ...mono, color: t.titles > 0 ? "#d4af37" : "var(--text-dim)" }}
                >
                  {t.titles} title{t.titles === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Apps</div>
                  <div className="tabular-nums" style={mono}>{t.apps}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pld</div>
                  <div className="tabular-nums" style={mono}>{t.pld}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W-L</div>
                  <div className="tabular-nums" style={mono}>{t.w}-{t.l}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">RF</div>
                  <div className="tabular-nums" style={mono}>{t.rf}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">RA</div>
                  <div className="tabular-nums" style={mono}>{t.ra}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Best finish</div>
                  <div className="text-[var(--text-muted)]">{t.best_finish ?? "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Team</th>
                <th className="py-2 px-3 text-right font-medium">Apps</th>
                <th className="py-2 px-3 text-right font-medium">Pld</th>
                <th className="py-2 px-3 text-right font-medium">W</th>
                <th className="py-2 px-3 text-right font-medium">L</th>
                <th className="py-2 px-3 text-right font-medium">RF</th>
                <th className="py-2 px-3 text-right font-medium">RA</th>
                <th className="py-2 px-3 text-right font-medium">Titles</th>
                <th className="py-2 px-3 font-medium">Best finish</th>
              </tr>
            </thead>
            <tbody>
              {allTime.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">{teamLink(t.name)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.apps}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.pld}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.w}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.l}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.rf}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.ra}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.titles > 0 ? "#d4af37" : "var(--text-dim)" }}>
                    {t.titles}
                  </td>
                  <td className="py-1.5 px-3 text-xs">{t.best_finish ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Current world ranking ---------------- */}
      <WorldRankingSection
        id="world-ranking"
        heading="Current world ranking"
        blurb="The live WBSC men's baseball ranking by points."
        ranking={getWorldRanking("baseball-men")}
      />

      {/* ---------------- Editions ---------------- */}
      <section className="mb-10">
        <h2 id="editions" className="text-lg font-semibold mb-3">Editions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hub.editions.slice().reverse().map((e) => (
            <div key={e.year} className="rounded-xl border p-4" style={card}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-semibold tabular-nums" style={mono}>{e.year}</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                  {e.teams} teams · {e.games} games
                </span>
              </div>
              <div className="text-sm">
                <span className="font-semibold" style={{ color: "#d4af37" }}>{teamLink(e.champion)}</span>
                <span className="text-xs text-[var(--text-muted)]"> bt {teamLink(e.runner_up)} {e.score}</span>
              </div>
              <div className="text-xs text-[var(--text-dim)] mt-1">
                Final at {e.venue}{e.city ? `, ${e.city}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Teams ---------------- */}
      <section className="mb-10">
        <h2 id="teams" className="text-lg font-semibold mb-3">Nations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((t) => (
            <Link
              key={t.slug}
              href={`/teams/baseball/${t.slug}`}
              className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
              style={card}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold inline-flex items-center gap-1.5">
                  {flagCdnUrl(t.slug) && (
                    <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" loading="lazy" decoding="async" />
                  )}
                  {t.name}
                </span>
                {t.titles > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                        style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>
                    {t.titles}× champions
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                {t.apps} WBC{t.apps === 1 ? "" : "s"} · {t.w}–{t.l} · {t.first}–{t.last}
              </div>
              {t.best_finish ? (
                <div className="text-xs text-[var(--text-dim)] mt-1">Best: {t.best_finish}</div>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Results compiled from the public record of all six World Baseball Classic
          tournaments (2006, 2009, 2013, 2017, 2023, 2026): pool standings, every game
          with venue, and the finals. Records count WBC finals-tournament games only;
          qualifiers are out of scope. Czechia&apos;s 2023 appearance as the Czech
          Republic is carried under Czechia. A WBSC world-rankings layer may join later.
        </p>
      </section>
    </main>
  );
}
