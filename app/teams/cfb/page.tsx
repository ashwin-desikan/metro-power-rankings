import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import { getAllCfbTeams, getAllCfbSlugs, getCfbTopGames, getCfbGamesByDecade, getCfbNationalChampions, type CfbTeam } from "@/lib/cfb";
import { getCfbStandings, getCfbRankings, type CfbPoll, type CfbConference } from "@/lib/cfb-live";
import CfbAllTimeTable from "./CfbAllTimeTable";
import CfbGames from "./CfbGames";

export const dynamicParams = false;
// Live standings/rankings ISR window (ESPN feeds via lib/cfb-live).
export const revalidate = 1800;
const PAGE_PATH = "/teams/cfb";
const PAGE_TITLE = "College Football";
const PAGE_DESCRIPTION =
  "Every major college football program through history: all-time records, national titles, AP poll dominance, and the greatest games of all time by Game Score.";

export const metadata: Metadata = {
  title: PAGE_TITLE, description: PAGE_DESCRIPTION, alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { card: "summary", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

const pollDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

function PollTable({ poll }: { poll: CfbPoll }) {
  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold">{poll.name}</div>
        <div className="text-[10px] text-[var(--text-dim)]">
          {[poll.week_label, pollDate(poll.date)].filter(Boolean).join(" \u00b7 ")}
        </div>
      </div>
      <ol className="px-2 py-2 space-y-0.5">
        {poll.rows.map((r) => (
          <li key={r.rank} className="flex items-baseline gap-2 text-sm px-1">
            <span className="w-5 text-[11px] tabular-nums text-[var(--text-dim)] text-right">{r.rank}</span>
            <CrestIcon name={r.school} size={15} className="self-center" />
            <span className="flex-1 truncate">
              {r.slug
                ? <Link href={`/teams/cfb/${r.slug}`} className="hover:text-[var(--accent)]">{r.school}</Link>
                : r.school}
              {r.first_place_votes > 0 && <span className="ml-1 text-[10px] text-[var(--text-dim)]">({r.first_place_votes})</span>}
            </span>
            <span className="tabular-nums text-xs text-[var(--text-muted)]">{r.record}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConferenceTable({ conf }: { conf: CfbConference }) {
  return (
    <details className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{conf.short}</span>
        <span className="text-[10px] text-[var(--text-dim)]">{conf.rows.length} teams</span>
      </summary>
      <div className="border-t overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs min-w-[300px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              <th className="px-2 py-1.5 text-right">#</th>
              <th className="px-2 py-1.5">School</th>
              <th className="px-2 py-1.5 text-right">Conf</th>
              <th className="px-2 py-1.5 text-right">Overall</th>
              <th className="px-2 py-1.5 text-right hidden sm:table-cell">PF</th>
              <th className="px-2 py-1.5 text-right hidden sm:table-cell">PA</th>
              <th className="px-2 py-1.5 text-right">Strk</th>
            </tr>
          </thead>
          <tbody>
            {conf.rows.map((t, i) => (
              <tr key={t.espn_id || t.school} className="border-t hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-1 text-right tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                <td className="px-2 py-1 font-medium whitespace-nowrap">
                  <CrestIcon name={t.school} size={14} className="mr-1 align-[-2px]" />
                  {t.slug
                    ? <Link href={`/teams/cfb/${t.slug}`} className="hover:text-[var(--accent)]">{t.school}</Link>
                    : t.school}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{t.conf || "\u2014"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t.overall}</td>
                <td className="px-2 py-1 text-right tabular-nums hidden sm:table-cell">{t.points_for || "\u2014"}</td>
                <td className="px-2 py-1 text-right tabular-nums hidden sm:table-cell">{t.points_against || "\u2014"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{t.streak ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Leader({ title, rows }: { title: string; rows: { name: string; slug: string; val: number }[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">{title}</div>
      <ol className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.slug} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 text-[11px] tabular-nums text-[var(--text-dim)]">{i + 1}</span>
            <CrestIcon name={r.name} size={16} className="mr-1" /><Link href={`/teams/cfb/${r.slug}`} className="flex-1 truncate hover:text-[var(--accent)]">{r.name}</Link>
            <span className="tabular-nums text-[var(--text-muted)]">{r.val}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function CfbHubPage() {
  const [rankings, standings] = await Promise.all([getCfbRankings(), getCfbStandings()]);
  const teams = getAllCfbTeams();
  const slugs = getAllCfbSlugs();
  const topGames = getCfbTopGames();
  const byDecade = getCfbGamesByDecade();
  const natChamps = getCfbNationalChampions();
  const totalNat = teams.reduce((n, t) => n + t.nat_champ_years.length, 0);
  const lead = (key: (t: CfbTeam) => number, n = 15) =>
    [...teams].sort((a, b) => key(b) - key(a)).slice(0, n).map((t) => ({ name: t.name, slug: t.slug, val: key(t) }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">College Football</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">College Football</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every major program through history, with full all-time records and honors, AP poll dominance, and the
          greatest games of all time by Game Score.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{teams.filter((t) => t.current_fbs).length}</strong> current FBS</div>
          <div><strong className="text-[var(--text)] text-sm">{teams.length}</strong> major programs all-time</div>
          <div><strong className="text-[var(--text)] text-sm">{totalNat}</strong> national titles tracked</div>
        </div>
      </header>

      <HubNav items={[
        ...(rankings.polls.length ? [{ label: "Rankings", href: "#rankings" }] : []),
        ...(standings.conferences.length ? [{ label: "Standings", href: "#standings" }] : []),
        { label: "All-time", href: "#all-time" }, { label: "National champions", href: "#champions" }, { label: "Greatest games", href: "#games" }, { label: "AP polls", href: "#polls" }]} />

      {rankings.polls.length > 0 && (
        <section id="rankings" className="mb-12 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">Rankings</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            The current Top 25s, straight from the polls: the College Football Playoff ranking when it is live, the AP Top 25 and the Coaches Poll. First-place votes in parentheses; each poll shows its own date.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {rankings.polls.map((p) => <PollTable key={p.kind} poll={p} />)}
          </div>
        </section>
      )}

      {standings.conferences.length > 0 && (
        <section id="standings" className="mb-12 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">Standings</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {standings.season_year ? `FBS conference standings, ${standings.season_year} season. ` : "FBS conference standings. "}
            Ordered by conference record. Notre Dame sits with the Power 4; the other independents with the Group of 5. Tap a conference to open it, and a school for its program page.
          </p>
          {[
            { title: "Power 4", confs: standings.conferences.filter((c) => c.power4) },
            { title: "Group of 5", confs: standings.conferences.filter((c) => !c.power4) },
          ].filter((t) => t.confs.length > 0).map((tier) => (
            <div key={tier.title} className="mb-5">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-2">{tier.title}</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                <div className="space-y-3">
                  {tier.confs.filter((_, i) => i % 2 === 0).map((c) => <ConferenceTable key={`${c.short}-${c.power4}`} conf={c} />)}
                </div>
                <div className="space-y-3">
                  {tier.confs.filter((_, i) => i % 2 === 1).map((c) => <ConferenceTable key={`${c.short}-${c.power4}`} conf={c} />)}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section id="all-time" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">All-time programs</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Current FBS by default; switch to all major programs in history. Click a column to sort.</p>
        <CfbAllTimeTable teams={teams} />
      </section>

      {natChamps.length > 0 && (
        <section id="champions" className="mb-12 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-1">National champions</h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">Recognized national champions by season, with the selectors in parentheses and the Heisman winner. Tap a school to open its program page.</p>

          {/* Mobile: one card per season. Same `natChamps` array/order that
              drives the desktop table below. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[70vh] overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
            {natChamps.map((nc) => (
              <div key={nc.year} className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <a href={`https://www.sports-reference.com/cfb/years/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium tabular-nums hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a>
                <div className="mt-1 text-sm">
                  {nc.champs.map((c, i) => (
                    <span key={i}>
                      {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                      <CrestIcon name={c.name} size={14} className="mr-1 align-[-2px]" />{c.slug ? <Link href={`/teams/cfb/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link> : <span className="font-medium">{c.name}</span>}
                      {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}
                    </span>
                  ))}
                </div>
                {nc.heisman && (
                  <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                    <span className="text-[9px] uppercase tracking-wide text-[var(--text-dim)] mr-1">Heisman</span>
                    {nc.heisman}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden sm:block max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 w-16">Year</th>
                  <th className="px-3 py-2">National champion</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Heisman</th>
                </tr>
              </thead>
              <tbody>
                {natChamps.map((nc) => (
                  <tr key={nc.year} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]"><a href={`https://www.sports-reference.com/cfb/years/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a></td>
                    <td className="px-3 py-1.5">
                      {nc.champs.map((c, i) => (
                        <span key={i}>
                          {i > 0 ? <span className="text-[var(--text-dim)]">, </span> : null}
                          <CrestIcon name={c.name} size={14} className="mr-1 align-[-2px]" />{c.slug ? <Link href={`/teams/cfb/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link> : <span className="font-medium">{c.name}</span>}
                          {c.sel ? <span className="text-[10px] text-[var(--text-dim)]"> ({c.sel})</span> : null}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)] hidden sm:table-cell">{nc.heisman}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section id="games" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">The greatest games</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Ranked by Game Score across all of college football history. Filter to a decade; each game shows the date, bowl, venue, and rivalry.</p>
        <CfbGames topOverall={topGames} byDecade={byDecade} linkSlugs={slugs} />
      </section>

      <section id="polls" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">AP poll history</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">All-time AP poll dominance since 1936.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Leader title="Weeks at #1" rows={lead((t) => t.weeks_at_1)} />
          <Leader title="Weeks ranked" rows={lead((t) => t.weeks_ranked)} />
          <Leader title="Final AP #1 (titles)" rows={lead((t) => t.final_ap1)} />
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Records, polls, and games from a hand-curated college football database. The season log covers major (FBS-designated) seasons only. Game Score rates each game by the quality and stakes of the matchup.
      </p>
    </main>
  );
}
