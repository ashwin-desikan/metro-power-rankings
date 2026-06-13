import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllRlNations, getRlHub } from "@/lib/rugbyLeagueIntl";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/rugby-league";
const TITLE = "International Rugby League";
const DESC =
  "The Rugby League World Cup, complete: all 16 editions from 1954 to 2021, every final, the all-time national honour table, and a page for each nation to have reached a World Cup semi-final.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function InternationalRugbyLeaguePage() {
  const hub = getRlHub();
  const teams = getAllRlNations();
  if (!hub) return null;

  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const teamLink = (name: string, className?: string) => {
    const slug = slugByName.get(name);
    return slug ? (
      <Link href={`/teams/rugby-league/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {name}
      </Link>
    ) : (
      <span className={className}>{name}</span>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Rugby League</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Rugby League</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The Rugby League World Cup, complete: all {hub.total_editions} editions from the
          inaugural 1954 tournament in France through 2021, every final, the all-time
          national honour table, and a page for each of the {hub.total_nations} nations to
          have reached a semi-final. Great Britain is kept as its own side for the years it
          competed as one, before England and Wales entered separately.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Champions", href: "#champions" },
          { label: "All-time Table", href: "#all-time" },
          { label: "Editions", href: "#editions" },
          { label: "Nations", href: "#nations" },
          { label: "Club rugby league", href: "#clubs" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- Champions ---------------- */}
      <section className="mb-10">
        <h2 id="champions" className="text-lg font-semibold mb-1">World Cup finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Every Rugby League World Cup decider since 1954.</p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Host</th>
              </tr>
            </thead>
            <tbody>
              {hub.finals.slice().reverse().map((f) => (
                <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                  <td className="py-2 px-3 font-semibold">{teamLink(f.champion)}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.score}</td>
                  <td className="py-2 px-3">{teamLink(f.runner_up)}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{f.host}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- All-time table ---------------- */}
      <section className="mb-10">
        <h2 id="all-time" className="text-lg font-semibold mb-1">All-time honour table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Final-four finishes only (the source records the semi-finalists of each edition), ordered by titles.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium">Titles</th>
                <th className="py-2 px-3 text-right font-medium">Runners-up</th>
                <th className="py-2 px-3 text-right font-medium">Semis</th>
                <th className="py-2 px-3 font-medium">Best finish</th>
                <th className="py-2 px-3 text-right font-medium">Span</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(t.slug) && (
                        <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" />
                      )}
                      {teamLink(t.name)}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.titles > 0 ? "#d4af37" : "var(--text-dim)" }}>
                    {t.titles}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.runner_ups}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.semis}</td>
                  <td className="py-1.5 px-3 text-xs">{t.best_finish}</td>
                  <td className="py-1.5 px-3 text-right text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                    {t.first}–{t.last}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Editions ---------------- */}
      <section className="mb-10">
        <h2 id="editions" className="text-lg font-semibold mb-3">Editions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hub.editions.slice().reverse().map((e) => (
            <div key={e.year} className="rounded-xl border p-4" style={card}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-semibold tabular-nums" style={mono}>{e.year}</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>{e.teams} teams</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold" style={{ color: "#d4af37" }}>{teamLink(e.champion)}</span>
                <span className="text-xs text-[var(--text-muted)]"> bt {teamLink(e.runner_up)} {e.score}</span>
              </div>
              <div className="text-xs text-[var(--text-dim)] mt-1">
                Hosts: {e.host}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Nations ---------------- */}
      <section className="mb-10">
        <h2 id="nations" className="text-lg font-semibold mb-3">Nations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((t) => (
            <Link
              key={t.slug}
              href={`/teams/rugby-league/${t.slug}`}
              className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
              style={card}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold inline-flex items-center gap-1.5">
                  {flagCdnUrl(t.slug) && (
                    <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" />
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
                {t.titles}T · {t.runner_ups}RU · {t.semis}SF · {t.first}–{t.last}
              </div>
              <div className="text-xs text-[var(--text-dim)] mt-1">Best: {t.best_finish}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Club rugby league ---------------- */}
      <section id="clubs" className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Club rugby league</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/teams/nrl" className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={card}>
            <div className="font-semibold text-base">NRL →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Australia&apos;s National Rugby League: every NSWRL/NRL club since 1908,
              premierships, ladders, and the full Grand Final roll.
            </div>
          </Link>
          <Link href="/teams/rugby-league/british" className="block rounded-xl border p-4 transition hover:border-[var(--accent)]" style={card}>
            <div className="font-semibold text-base">British Rugby League →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Britain&apos;s top-flight champions in one line: the Northern Union, the RFL
              Championship, and the Super League since 1996. Winners only.
            </div>
          </Link>
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Compiled from the public record of all 16 Rugby League World Cups (1954-2021):
          each edition&apos;s champion, runner-up and the two losing semi-finalists. Because
          the source captures the final four rather than every fixture, the table counts
          semi-final-or-better finishes, not total tournament entries. Great Britain (1954-1992)
          is kept as a distinct national side; England, Wales and the other home nations carry
          their own records from the editions they entered separately. The 2025 edition was
          postponed and is out of scope until played.
        </p>
      </section>
    </main>
  );
}
