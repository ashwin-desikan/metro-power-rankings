import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import RugbyGreatestGames from "@/app/teams/rugby-union/RugbyGreatestGames";
import { getAllRugbyTeams, getRugbyHub, rugbyWinPct } from "@/lib/rugbyUnion";
import { getRugbyGames } from "@/lib/rugbyGames";
import { getRugbyClubRolls } from "@/lib/rugbyClubs";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/rugby-union";
const TITLE = "International Rugby Union";
const DESC =
  "Test rugby since 1871: every Home/Five/Six Nations season, the Tri Nations and Rugby Championship, all ten Rugby World Cup finals, the weekly World Rugby rankings since 2003, and a page for every test nation on file.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function spanStr(first: string | null, last: string | null): string {
  if (!first || !last) return "";
  return `${first.slice(0, 4)}–${last.slice(0, 4)}`;
}

export default function RugbyUnionHubPage() {
  const hub = getRugbyHub();
  const teams = getAllRugbyTeams();
  const rg = getRugbyGames();
  if (!hub) return null;

  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const core = teams.filter((t) => t.six_nations || t.sanzaar)
    .sort((a, b) => (a.ranking && a.ranking.current ? a.ranking.current : 99) - (b.ranking && b.ranking.current ? b.ranking.current : 99));
  const rest = teams.filter((t) => !t.six_nations && !t.sanzaar && t.record)
    .sort((a, b) => (b.record ? b.record.m : 0) - (a.record ? a.record.m : 0));

  const teamLink = (name: string) => {
    const slug = slugByName.get(name);
    const flag = slug ? flagCdnUrl(slug) : null;
    const inner = slug ? (
      <Link href={`/teams/rugby-union/${slug}`} className="hover:text-[var(--accent)]">{name}</Link>
    ) : (
      <span>{name}</span>
    );
    return flag ? (
      <span className="inline-flex items-center gap-1.5"><img src={flag} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" />{inner}</span>
    ) : inner;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Rugby Union</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Rugby Union</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Test rugby from the first international in 1871: {hub.totals.matches.toLocaleString()} matches,
          every season of the Home, Five and Six Nations and of the Tri Nations and Rugby
          Championship, all the Rugby World Cup finals, and the weekly World Rugby rankings
          since 2003 — with a page for every test nation on file.
        </p>
      </header>

      <HubNav
        items={[
          { label: "World Rankings", href: "#rankings" },
          { label: "Six Nations", href: "#six-nations" },
          { label: "Rugby Championship", href: "#rugby-championship" },
          { label: "World Cup", href: "#world-cup" },
          { label: "Greatest Games", href: "#greatest-games" },
          { label: "Teams", href: "#teams" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- Domestic Rugby hub card ---------------- */}
      {(() => {
        const clubs = getRugbyClubRolls();
        if (!clubs) return null;
        const comps = ["european", "top14", "premiership", "urc", "super", "currie", "japan"]
          .filter((k) => clubs.rolls[k]);
        const latest = clubs.rolls["european"] && clubs.rolls["european"][0];
        return (
          <Link
            href="/teams/rugby-union/clubs"
            className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
            style={card}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-base">Domestic Rugby →</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  The club game&apos;s honours boards: {comps.map((k) => clubs.labels[k]).join(", ")} —
                  every champion since 1892, linked to their metros.
                </div>
              </div>
              {latest ? (
                <div className="text-xs text-[var(--text-dim)]" style={mono}>
                  Latest Champions Cup: {latest.winner} {latest.season}
                </div>
              ) : null}
            </div>
          </Link>
        );
      })()}

      {/* ---------------- World rankings ---------------- */}
      <section className="mb-10">
        <h2 id="rankings" className="text-lg font-semibold mb-1">World Rugby rankings</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          As of {hub.rankings_as_of}; weeks at number one counted from the first published
          table in October 2003.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Current top 15</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-1 pr-2 font-medium">#</th>
                  <th className="py-1 font-medium">Team</th>
                </tr>
              </thead>
              <tbody>
                {hub.world_rankings.slice(0, 15).map((r) => (
                  <tr key={r.team} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 pr-2 tabular-nums" style={mono}>{r.rank}</td>
                    <td className="py-1">{teamLink(r.team)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Weeks at number one</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-1 pr-2 font-medium">Team</th>
                  <th className="py-1 pr-2 text-right font-medium">Weeks</th>
                  <th className="py-1 pr-2 text-right font-medium">Longest</th>
                  <th className="py-1 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {hub.number_ones.map((r) => (
                  <tr key={r.team} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 pr-2">{teamLink(r.team)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums" style={mono}>{r.weeks}</td>
                    <td className="py-1 pr-2 text-right tabular-nums" style={mono}>{r.longest}</td>
                    <td className="py-1 text-right tabular-nums" style={mono}>{r.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------------- Six Nations ---------------- */}
      <section className="mb-10">
        <h2 id="six-nations" className="text-lg font-semibold mb-1">
          Home, Five &amp; Six Nations roll of honour
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every championship since 1883; shared titles list all champions. GS marks a
          Grand Slam, TC a Triple Crown.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[480px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Season</th>
                <th className="py-2 px-3 font-medium">Champions</th>
                <th className="py-2 px-3 font-medium">Grand Slam</th>
                <th className="py-2 px-3 font-medium">Triple Crown</th>
              </tr>
            </thead>
            <tbody>
              {hub.six_nations_roll.map((r) => (
                <tr key={r.season} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.season}</td>
                  <td className="py-1.5 px-3 font-medium">
                    {r.champions.length > 0
                      ? r.champions.map((c, i) => (
                          <span key={c}>{i > 0 ? " / " : ""}{teamLink(c)}</span>
                        ))
                      : <span className="text-xs text-[var(--text-dim)]">—</span>}
                  </td>
                  <td className="py-1.5 px-3 text-xs">{r.grand_slam ?? ""}</td>
                  <td className="py-1.5 px-3 text-xs">{r.triple_crown ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Rugby Championship ---------------- */}
      <section className="mb-10">
        <h2 id="rugby-championship" className="text-lg font-semibold mb-1">
          Tri Nations &amp; Rugby Championship roll of honour
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Southern-hemisphere championship since 1996.</p>
        <div className="rounded-xl border overflow-x-auto max-h-[420px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[420px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Season</th>
                <th className="py-2 px-3 font-medium">Competition</th>
                <th className="py-2 px-3 font-medium">Champions</th>
              </tr>
            </thead>
            <tbody>
              {hub.trc_roll.map((r) => (
                <tr key={r.season} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.season}</td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{r.comp.replace(/^\d{4}\s*/, "")}</td>
                  <td className="py-1.5 px-3 font-medium">
                    {r.champions.map((c, i) => (
                      <span key={c}>{i > 0 ? " / " : ""}{teamLink(c)}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- World Cup ---------------- */}
      <section className="mb-10">
        <h2 id="world-cup" className="text-lg font-semibold mb-1">Rugby World Cup finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Every final since the inaugural tournament in 1987.</p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[620px]">
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
              {hub.rwc_finals.slice().reverse().map((f) => (
                <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                  <td className="py-2 px-3 font-semibold">{teamLink(f.winner)}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.score}</td>
                  <td className="py-2 px-3">{f.runner_up ? teamLink(f.runner_up) : ""}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{f.venue}{f.city ? `, ${f.city}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Greatest Games ---------------- */}
      <section className="mb-10">
        <h2 id="greatest-games" className="text-lg font-semibold mb-1">The greatest tests</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every men&apos;s international since 1871 ranked by a computed Game Score: how close the match
          was, what was at stake, and how strong both sides were on the day, with team strength measured
          by a continuous Elo rating spanning the whole history. A star marks a curated all-time classic.
          Filter by decade; hover a score for its components.
        </p>
        <RugbyGreatestGames top={rg.top} decades={rg.by_decade} limit={50} />
      </section>

      {/* ---------------- Teams ---------------- */}
      <section className="mb-10">
        <h2 id="teams" className="text-lg font-semibold mb-3">Test nations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {core.map((t) => {
            const pct = t.record ? rugbyWinPct(t.record) : null;
            return (
              <Link
                key={t.slug}
                href={`/teams/rugby-union/${t.slug}`}
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
                    {t.six_nations ? "Six Nations" : "SANZAAR"}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                  {t.record ? (
                    <>
                      {t.record.m.toLocaleString()} tests · {spanStr(t.record.first, t.record.last)}
                      {pct !== null ? <> · {pct}% won</> : null}
                    </>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-2 flex flex-wrap gap-x-3">
                  {t.ranking && t.ranking.current !== null ? (
                    <span style={mono}>World #{t.ranking.current}</span>
                  ) : null}
                  {t.rwc && t.rwc.titles > 0 ? (
                    <span style={mono}>RWC ×{t.rwc.titles}</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Team</th>
                <th className="py-2 px-3 font-medium">Span</th>
                <th className="py-2 px-3 text-right font-medium">Tests</th>
                <th className="py-2 px-3 text-right font-medium">W</th>
                <th className="py-2 px-3 text-right font-medium">L</th>
                <th className="py-2 px-3 text-right font-medium">D</th>
                <th className="py-2 px-3 text-right font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((t) => {
                const r = t.record;
                if (!r) return null;
                const pct = rugbyWinPct(r);
                return (
                  <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3">
                      <Link href={`/teams/rugby-union/${t.slug}`} className="hover:text-[var(--accent)] font-medium inline-flex items-center gap-1.5">
                        {flagCdnUrl(t.slug) ? <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={18} height={13} className="inline-block flex-shrink-0" /> : null}
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 tabular-nums" style={mono}>{spanStr(r.first, r.last)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.m}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.w}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.l}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.d}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{pct !== null ? pct : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)] mb-2">
          Results and season tables are compiled and hand-curated in the project workbook:
          every championship test from the 1883 Home Nations onward, Rugby World Cup pools
          and knockouts, tour matches and autumn/summer internationals, with standings,
          Grand Slams, Triple Crowns and titles derived from the match ledger. Scheduled
          fixtures without a result are excluded from all records.
        </p>
        <p className="text-[var(--text-muted)]">
          World rankings are the weekly published Men&apos;s World Rugby rankings from
          October 2003 onward, via the{" "}
          <a
            href="https://commons.wikimedia.org/wiki/Data:Men%27s_World_Rugby_rankings.tab"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--accent)]"
          >
            Wikimedia Commons dataset
          </a>
          . Western Samoa results are carried under Samoa.
        </p>
      </section>
    </main>
  );
}
