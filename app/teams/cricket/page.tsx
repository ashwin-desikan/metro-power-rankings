import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import {
  CRICKET_FORMATS,
  getAllCricketTeams,
  getCricketHub,
  winPct,
} from "@/lib/cricket";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/cricket";
const TITLE = "International Cricket";
const DESC =
  "Every men's cricket international since 1877: Tests, ODIs and T20Is for all twelve full members and every associate nation, with the recomputed monthly Citizen of Nowhere rankings, number-one reigns, major-tournament honours, and the named series trophies from the Ashes on down.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const HONOUR_COLS: { key: "wc" | "t20wc" | "ct" | "wtc" | "asia"; label: string }[] = [
  { key: "wc", label: "World Cup" },
  { key: "t20wc", label: "T20 World Cup" },
  { key: "ct", label: "Champions Trophy" },
  { key: "wtc", label: "WTC Final" },
  { key: "asia", label: "Asia Cup" },
];

function fmtSpan(first: string | null, last: string | null): string {
  if (!first || !last) return "";
  return `${first.slice(0, 4)}–${last.slice(0, 4)}`;
}

export default function CricketHubPage() {
  const hub = getCricketHub();
  const teams = getAllCricketTeams();
  if (!hub) return null;

  const fullMembers = teams.filter((t) => t.full_member);
  const associates = teams
    .filter((t) => !t.full_member && !t.composite)
    .sort((a, b) => b.overall.m - a.overall.m);
  const composites = teams.filter((t) => t.composite);

  // Every team name rendered on this page should resolve to its team page.
  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const teamLink = (name: string, className?: string) => {
    const slug = slugByName.get(name);
    return slug ? (
      <Link href={`/teams/cricket/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {name}
      </Link>
    ) : (
      <span className={className}>{name}</span>
    );
  };
  // "Contested by" strings are "Team A v Team B": link both sides.
  const contestedBy = (s: string) => {
    const parts = s.split(" v ");
    if (parts.length !== 2) return <span>{s}</span>;
    return (
      <span>
        {teamLink(parts[0].trim())}
        {" v "}
        {teamLink(parts[1].trim())}
      </span>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Cricket</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Cricket</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every men&apos;s international on file from the first Test in 1877 to this
          week&apos;s fixtures: {hub.totals.matches.toLocaleString()} matches across Tests,
          ODIs and T20Is, all {hub.totals.full_members} full members and every associate
          nation, with the Citizen of Nowhere rankings recomputed monthly from first
          principles, the all-time number-one reigns, major-tournament honours, and the
          named series trophies from the Ashes on down.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Domestic T20", href: "#domestic-t20" },
          { label: "Rankings", href: "#rankings" },
          { label: "No. 1 Reigns", href: "#number-ones" },
          { label: "Honours", href: "#honours" },
          { label: "Series Trophies", href: "#series-trophies" },
          { label: "Full Members", href: "#full-members" },
          { label: "Associates", href: "#associates" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- Domestic hubs ---------------- */}
      <div id="domestic-t20" className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <Link
          href="/teams/cricket/t20"
          className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
          style={card}
        >
          <div className="font-semibold text-base">Domestic T20 →</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            The franchise game&apos;s honours boards: champions of the IPL, Big Bash,
            PSL, CPL, BPL, T20 Blast, Super Smash, The Hundred, SA20, ILT20 and LPL.
          </div>
        </Link>
        <Link
          href="/teams/ipl"
          className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
          style={card}
        >
          <div className="font-semibold text-base">IPL →</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            The full Indian Premier League portal: all 10 franchises, season
            standings, playoffs and finals history since 2008.
          </div>
        </Link>
        <Link
          href="/teams/cricket/county"
          className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
          style={card}
        >
          <div className="font-semibold text-base">County Championship →</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            England&apos;s first-class domestic competition, the oldest in the sport:
            every champion since 1890.
          </div>
        </Link>
      </div>

      {/* ---------------- Current rankings ---------------- */}
      <section className="mb-10">
        <h2 id="rankings" className="text-lg font-semibold mb-1">Current Citizen of Nowhere Rankings</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Our own tables, recomputed monthly from full match results with the official
          rating algorithm; latest table {hub.current_rankings.Test.month}.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CRICKET_FORMATS.map((fmt) => (
            <div key={fmt} className="rounded-xl border p-4" style={card}>
              <div className="font-semibold mb-2">{fmt}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-1 pr-2 font-medium">#</th>
                    <th className="py-1 pr-2 font-medium">Team</th>
                    <th className="py-1 text-right font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.current_rankings[fmt].rows.map((r) => (
                    <tr key={r.team} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-2 tabular-nums" style={mono}>{r.rank}</td>
                      <td className="py-1 pr-2">{teamLink(r.team)}</td>
                      <td className="py-1 text-right tabular-nums" style={mono}>{r.rating.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Number-one reigns ---------------- */}
      <section className="mb-10">
        <h2 id="number-ones" className="text-lg font-semibold mb-1">Months at number one</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          All-time reigns at the top of each table, from the first ranked month onward.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CRICKET_FORMATS.map((fmt) => (
            <div key={fmt} className="rounded-xl border p-4" style={card}>
              <div className="font-semibold mb-2">{fmt}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-1 pr-2 font-medium">Team</th>
                    <th className="py-1 pr-2 text-right font-medium">Months</th>
                    <th className="py-1 pr-2 text-right font-medium">Longest</th>
                    <th className="py-1 text-right font-medium">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.number_ones[fmt].slice(0, 8).map((r) => (
                    <tr key={r.team} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-2">{teamLink(r.team)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums" style={mono}>{r.months}</td>
                      <td className="py-1 pr-2 text-right tabular-nums" style={mono}>{r.longest}</td>
                      <td className="py-1 text-right tabular-nums" style={mono}>{r.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Honours ---------------- */}
      <section className="mb-10">
        <h2 id="honours" className="text-lg font-semibold mb-1">Major-tournament honours</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Titles and runner-up finishes across the five majors, editions through the most recent.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Team</th>
                {HONOUR_COLS.map((c) => (
                  <th key={c.key} className="py-2 px-3 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hub.honours.map((h) => (
                <tr key={h.team} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {teamLink(h.team, "font-medium")}
                  </td>
                  {HONOUR_COLS.map((c) => {
                    const line = h[c.key];
                    return (
                      <td key={c.key} className="py-2 px-3">
                        {line.titles > 0 ? (
                          <div>
                            <span className="font-semibold tabular-nums" style={mono}>{line.titles}</span>
                            <span className="text-xs text-[var(--text-muted)]"> ({line.title_years})</span>
                          </div>
                        ) : null}
                        {line.ru > 0 ? (
                          <div className="text-xs text-[var(--text-dim)]">
                            RU {line.ru} ({line.ru_years})
                          </div>
                        ) : null}
                        {line.titles === 0 && line.ru === 0 ? (
                          <span className="text-xs text-[var(--text-dim)]">—</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hub.honours_note ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">{hub.honours_note}</p>
        ) : null}
      </section>

      {/* ---------------- Series trophies ---------------- */}
      <section className="mb-10">
        <h2 id="series-trophies" className="text-lg font-semibold mb-1">Named series trophies</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Bilateral trophies with the full series ledger behind each; holder as of the most recent series.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Trophy</th>
                <th className="py-2 px-3 font-medium">Contested by</th>
                <th className="py-2 px-3 font-medium">Format</th>
                <th className="py-2 px-3 font-medium">Span</th>
                <th className="py-2 px-3 text-right font-medium">Series</th>
                <th className="py-2 px-3 font-medium">Holder</th>
              </tr>
            </thead>
            <tbody>
              {hub.series_trophies.map((t) => (
                <tr key={t.trophy} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 font-medium">{t.trophy}</td>
                  <td className="py-2 px-3">{contestedBy(t.contested_by)}</td>
                  <td className="py-2 px-3">{t.format}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{t.first}–{t.last}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{t.series}</td>
                  <td className="py-2 px-3">{t.holder ? teamLink(t.holder) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Full members ---------------- */}
      <section className="mb-10">
        <h2 id="full-members" className="text-lg font-semibold mb-3">Full members</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fullMembers.map((t) => {
            const pct = winPct(t.overall);
            return (
              <Link
                key={t.slug}
                href={`/teams/cricket/${t.slug}`}
                className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
                style={card}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold inline-flex items-center gap-1.5">
                    {flagCdnUrl(t.slug) ? <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" /> : null}
                    {t.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
                        style={{ ...card, ...mono }}>
                    Full Member
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                  {t.overall.m.toLocaleString()} matches · {fmtSpan(t.overall.first, t.overall.last)}
                  {pct !== null ? <> · {pct}% won</> : null}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {CRICKET_FORMATS.map((f) => {
                    const rk = t.rankings[f];
                    return rk && rk.current_rank !== null ? (
                      <span key={f} style={mono}>{f} #{rk.current_rank}</span>
                    ) : null;
                  })}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------------- Associates ---------------- */}
      <section className="mb-10">
        <h2 id="associates" className="text-lg font-semibold mb-1">Associate nations</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every other nation with men&apos;s internationals on file, T20I era included.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Team</th>
                <th className="py-2 px-3 font-medium">Span</th>
                <th className="py-2 px-3 text-right font-medium">M</th>
                <th className="py-2 px-3 text-right font-medium">W</th>
                <th className="py-2 px-3 text-right font-medium">L</th>
                <th className="py-2 px-3 text-right font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {associates.map((t) => {
                const pct = winPct(t.overall);
                return (
                  <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3">
                      <Link href={`/teams/cricket/${t.slug}`} className="hover:text-[var(--accent)] font-medium inline-flex items-center gap-1.5">
                        {flagCdnUrl(t.slug) ? <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={18} height={13} className="inline-block flex-shrink-0" /> : null}
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{fmtSpan(t.overall.first, t.overall.last)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.overall.m}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.overall.w}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.overall.l}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{pct !== null ? pct : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {composites.length > 0 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Composite sides ({composites.map((t) => t.name).join(", ")}) are kept on file but
            not treated as nations.
          </p>
        ) : null}
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)] mb-2">
          Match results compiled from ball-by-ball and scorecard archives (Cricsheet and
          public results datasets), curated and corrected by hand in the project&apos;s
          cricket workbook, which is the source of truth for every figure on these pages.
          Tests run from 1877, ODIs from 1971, T20Is from 2005, with the post-2018
          expansion of T20I status reflected for associate nations.
        </p>
        <p className="text-[var(--text-muted)] mb-2">
          Rankings are not scraped: the monthly Test, ODI and T20I tables are recomputed
          from full results with the official rating algorithm and validated against the
          published number-one reigns. Major honours follow the workbook&apos;s curated
          tagging of World Cup, T20 World Cup, Champions Trophy, World Test Championship
          and Asia Cup editions.
        </p>
        <p className="text-[var(--text-muted)]">
          These are our own ratings, not the ICC&apos;s, and they own their differences.
          A windowed recomputation can anchor a team&apos;s level only through its
          opponents, so sides that play almost entirely inside a closed regional pool
          can&apos;t be placed on the same scale as the global circuit — the main T20I
          table therefore covers full members and circuit-connected nations, while
          regional-pool sides are ranked in the separate associate run. And in the
          crossover band where strong associates meet the full-member tail, our order
          and the official order can differ by two or three places: the official scale
          inherits historical levels that no match window can reconstruct. The head of
          each table is robust, and the all-time number-one reigns validate against the
          published record.
        </p>
      </section>
    </main>
  );
}
