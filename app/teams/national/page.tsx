import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import NationalTopGames from "@/app/teams/national/TopGamesTable";
import Link from "next/link";
import {
  getAllNationalTeams,
  getAllTournamentHubs,
  getWorldCup2026,
  getRankSnapshots,
  getTopGamesAllTime,
  getTopGamesByDecade,
} from "@/lib/international";
import {
  centroidForTeam,
  TOURNAMENT_HUB_ORDER,
  countryPageSlugFor,
} from "@/lib/international-display";
import { getAllCountrySlugs } from "@/lib/countries";
import { getWc2026LiveStandings, mergeWc2026Live, mergeWc2026Knockout, getWc2026LiveScores, fetchWc2026Bundle, getWc2026Kickoffs, attachWc2026Kickoffs } from "@/lib/wc2026Standings";
import { getInternationalComps, type LiveComp } from "@/lib/clubFootballLive";
import type { ReactNode } from "react";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import NationalIndexClient, { type IndexTeam } from "./NationalIndexClient";
import WorldCup2026 from "./WorldCup2026";
import { SportBadge } from "@/app/teams/_shared/SportIcon";

export const metadata: Metadata = {
  title: "International Football",
  description:
    "Canonical pages for every senior men's national football team with tournament history on file, plus hubs for the FIFA World Cup, all six continental cups, and intercontinental tournaments. A sibling product to the metro-anchored Club Football pages.",
  alternates: { canonical: "/teams/national" },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `International Football | ${SITE_NAME}`,
    description:
      "Senior national-team pages, all-time tournament hubs, and trophy history sourced from the grand football workbook.",
    url: `${BASE_URL}/teams/national`,
    type: "website",
  },
};

// Live-window bounds for the collapsible tournament sections below. These are
// the first and last fixture dates of each tournament, read off the
// api-football fixture bundle rather than guessed: the 2026-27 Nations League
// league phase is 156 fixtures from 2026-09-24 to 2026-11-17, and AFC Asian Cup
// (league 7, season 2027) runs 2027-01-07 to 2027-01-20.
//
// NOTE: `isLiveWindow` is evaluated server-side at render, so the green dot
// flips within the page's ISR window rather than at the exact minute of
// kickoff. That is the intended precision — this marks "tournament in
// progress", not "match in progress".
const UNL_WINDOW = { start: "2026-09-24", end: "2026-11-17" };
const ASIAN_CUP_WINDOW = { start: "2027-01-07", end: "2027-01-20" };

function isLiveWindow(w: { start: string; end: string }): boolean {
  // ISO YYYY-MM-DD sorts lexicographically, so string comparison is correct.
  // UTC keeps a Vercel lambda and a local build agreeing on the date.
  const today = new Date().toISOString().slice(0, 10);
  return today >= w.start && today <= w.end;
}

/**
 * Collapsed-by-default group tables for one international competition.
 *
 * Shared by the Nations League and the Asian Cup because they are structurally
 * identical here: both arrive in the same api-football bundle under
 * `international`, both are a handful of small group tables, and both spend
 * most of the year as a schedule note rather than live data. Collapsed by
 * default so the hub opens on the World Cup bracket, not on 14 group tables.
 */
function TournamentSection({
  id,
  title,
  window: win,
  comp,
  closedNote,
  teamByName,
  flagFor,
  fallback,
}: {
  id: string;
  title: string;
  window: { start: string; end: string };
  comp: LiveComp | null;
  closedNote: string;
  teamByName: Map<string, string>;
  flagFor: (name: string) => string | null;
  fallback: ReactNode;
}) {
  const groups = comp?.groups ?? [];
  const live = isLiveWindow(win);

  return (
    <section id={id} className="mb-10">
      <details>
        <summary className="cursor-pointer list-none flex items-center gap-2 mb-3 group">
          <h2 className="text-lg font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
            {title}
          </h2>
          {live && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0"
              aria-label="Tournament in progress"
              title="Tournament in progress"
            />
          )}
          <span className="text-xs text-[var(--text-dim)]">
            {groups.length > 0
              ? `${groups.length} group${groups.length === 1 ? "" : "s"} · click to expand`
              : closedNote}
          </span>
          <svg
            className="w-4 h-4 text-[var(--text-dim)] transition-transform details-chevron ml-auto flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>

        {groups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            {groups
              .slice()
              .sort((a, b) => a.group_label.localeCompare(b.group_label))
              .map((g) => (
                <div
                  key={g.group_label}
                  className="rounded-xl border p-3 min-w-0"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">{g.group_label}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-sticky-col="2">
                      <thead>
                        <tr className="text-left text-[var(--text-muted)]">
                          <th className="py-1 px-1.5 font-medium text-right">#</th>
                          <th className="py-1 px-1.5 font-medium">Team</th>
                          <th className="py-1 px-1.5 font-medium text-right">P</th>
                          <th className="py-1 px-1.5 font-medium text-right">GD</th>
                          <th className="py-1 px-1.5 font-medium text-right">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows
                          .slice()
                          .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0))
                          .map((r, i) => {
                            const nm = r.name ?? "";
                            const slug = teamByName.get(nm.toLowerCase());
                            const flag = flagFor(nm);
                            return (
                              <tr key={`${g.group_label}-${nm}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                                <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]">{r.rank ?? i + 1}</td>
                                <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5">
                                    {flag && (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img src={flag} alt="" className="w-4 h-3 rounded-[2px] object-cover" loading="lazy" />
                                    )}
                                    {slug ? <Link href={`/teams/national/${slug}`} className="hover:underline">{nm}</Link> : nm}
                                  </span>
                                </td>
                                <td className="py-1 px-1.5 text-right tabular-nums">{r.played ?? 0}</td>
                                <td className="py-1 px-1.5 text-right tabular-nums">{r.gd ?? 0}</td>
                                <td className="py-1 px-1.5 text-right tabular-nums font-semibold">{r.points ?? 0}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          fallback
        )}
      </details>
    </section>
  );
}

export default async function NationalIndexPage() {
  const teams = getAllNationalTeams();
  const hubs = getAllTournamentHubs();
  // Fetch wc2026.json + wc2026-sim.json at runtime from GitHub raw so the
  // bracket and sim odds update via ISR without a Vercel deploy. Falls back
  // to the build-time bundle on any network failure.
  const wc2026 = await fetchWc2026Bundle(getWorldCup2026());
  const wc2026Live = wc2026 ? await getWc2026LiveStandings() : null;
  const wc2026Scores = wc2026 ? await getWc2026LiveScores() : null;
  const wc2026Kickoffs = wc2026 ? await getWc2026Kickoffs() : [];
  const snapshots = getRankSnapshots();
  const countrySlugSet = new Set(getAllCountrySlugs());
  // UEFA Nations League live groups (api-football bundle, league_id 5).
  // Empty until the 2026 league phase (24 Sep–17 Nov); the section shows a
  // schedule banner until then and arms itself when tables arrive.
  const intlComps = await getInternationalComps();
  const unl = intlComps.find((c) => c.league_id === 5) ?? null;
  // AFC Asian Cup 2027 (league_id 7). Same bundle, same shape; empty until the
  // mini's refresh first sees group tables in January 2027.
  const asianCup = intlComps.find((c) => c.league_id === 7) ?? null;
  const teamByName = new Map(teams.flatMap((t) => [[t.name.toLowerCase(), t.slug] as const, [t.cur_name.toLowerCase(), t.slug] as const]));
  // Name -> flag CDN url for any international group table (UNL, Asian Cup).
  // Slugifies the api-football team name the same way the country slugs are
  // built; SUBDIVISION_CDN_CODES in international-display.ts covers the names
  // that do not slugify to a COUNTRY_FLAGS key (turkiye, kosovo, and friends).
  const intlFlag = (n: string) => flagCdnUrl(n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));

  const clientTeams: IndexTeam[] = teams.map((t) => {
    const resolvedCountrySlug = countryPageSlugFor(t.slug);
    return {
      slug: t.slug,
      cur_name: t.cur_name,
      continent: t.continent ?? "World",
      federation: t.federation,
      trophies: t.totals.trophies,
      major_trophies: t.totals.major_trophies,
      last_trophy: t.totals.last_trophy,
      last_major_trophy: t.totals.last_major_trophy,
      tour_app: t.totals.tour_app,
      fifa_rank: t.fifa_rank,
      elo_rank: t.elo_rank,
      centroid: centroidForTeam({ slug: t.slug, continent: t.continent }),
      active: t.active,
      has_country_page: countrySlugSet.has(resolvedCountrySlug),
      country_page_slug: countrySlugSet.has(resolvedCountrySlug) ? resolvedCountrySlug : null,
    };
  });

  // Order hubs per editorial priority.
  const orderedHubs = TOURNAMENT_HUB_ORDER
    .map((slug) => hubs.find((h) => h.slug === slug))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>International Football</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 mb-2">
            <SportBadge sport="national" />
            <h1 className="text-3xl font-semibold tracking-tight">International Football</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/teams/national/quiz"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              Try the honors quiz →
            </Link>
            <a
              href="/play/rules-lab.html"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              Football rules →
            </a>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          National-team coverage as a sibling product to the metro-anchored Club Football pages.
          Every senior men&apos;s national team with tournament history on file, every FIFA World
          Cup, every continental championship (Euros, Copa América, AFCON, Asian Cup, Gold Cup,
          OFC Nations Cup), plus intercontinental tournaments (Confederations Cup, Mundialito,
          Finalissima). Friendlies and qualifiers are out of scope.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Nations League", href: "#nations-league" },
          { label: "Asian Cup 2027", href: "#asian-cup" },
          { label: "Tournament Hubs", href: "#tournaments" },
          { label: "National Teams", href: "#national-teams" },
          { label: "Top Games", href: "#top-games" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {wc2026 && <WorldCup2026 wc={attachWc2026Kickoffs(mergeWc2026Knockout(mergeWc2026Live(wc2026, wc2026Live), wc2026Scores), wc2026Kickoffs)} />}

      {/* UEFA Nations League and AFC Asian Cup — live group tables from the
          api-football bundle (league_id 5 and 7), same daily refresh as the
          club competitions. Both collapsed by default: outside their windows
          they are a schedule note, and in-window the Nations League alone is
          14 group tables. The green dot in each summary marks that tournament
          as in progress. */}
      <TournamentSection
        id="nations-league"
        title="UEFA Nations League 2026-27"
        window={UNL_WINDOW}
        comp={unl}
        closedNote="24 Sep – 17 Nov · click for details"
        teamByName={teamByName}
        flagFor={intlFlag}
        fallback={
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">
              The 2026-27 league phase runs 24 September to 17 November. Live group tables appear
              here, and in the International Football section of{" "}
              <Link href="/sports/standings#international-football" className="hover:underline" style={{ color: "var(--accent)" }}>
                Live Standings
              </Link>
              , from the first matchday, fed by the same daily refresh as the club competitions.
            </p>
          </div>
        }
      />

      <TournamentSection
        id="asian-cup"
        title="AFC Asian Cup 2027"
        window={ASIAN_CUP_WINDOW}
        comp={asianCup}
        closedNote="7 – 20 Jan 2027 · click for details"
        teamByName={teamByName}
        flagFor={intlFlag}
        fallback={
          <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">
              The 2027 Asian Cup runs 7 to 20 January 2027. Live group tables appear here, and in
              the International Football section of{" "}
              <Link href="/sports/standings#international-football" className="hover:underline" style={{ color: "var(--accent)" }}>
                Live Standings
              </Link>
              , from the first matchday. Every edition on file is on the{" "}
              <Link href="/teams/national/tournaments/asian-cup" className="hover:underline" style={{ color: "var(--accent)" }}>
                Asian Cup hub
              </Link>.
            </p>
          </div>
        }
      />

      <section className="mb-10">
        <h2 id="tournaments" className="text-lg font-semibold mb-3">Tournament hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orderedHubs.map((h) => (
            <Link
              key={h.slug}
              href={`/teams/national/tournaments/${h.slug}`}
              className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="font-semibold">{h.label}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                {h.editions} edition{h.editions === 1 ? "" : "s"}
                {h.year_min && h.year_max ? <> · {h.year_min}–{h.year_max}</> : null}
              </div>
              {h.most_decorated.length > 0 && (
                <div className="text-xs text-[var(--text-muted)] mt-2">
                  Most titled: <span className="font-medium text-[var(--text)]">{h.most_decorated[0].cur_name}</span> ({h.most_decorated[0].champion_count})
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 id="national-teams" className="text-lg font-semibold mb-3">National teams</h2>
        <NationalIndexClient teams={clientTeams} snapshots={snapshots} />
      </section>

      <section id="top-games" className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Greatest games</h2>
        <NationalTopGames allTime={getTopGamesAllTime()} byDecade={getTopGamesByDecade()} />
      </section>

      <section
        id="methodology"
        className="mt-10 rounded-xl border p-5 text-sm"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold mb-2">Honors index methodology</h2>
        <p className="text-[var(--text-muted)] mb-3">
          A weighted score across every senior international achievement on file. Drives the
          Comparable Programs cohorts on each team page and the <Link href="/teams/national/quiz" className="underline hover:text-[var(--accent)]">honors quiz</Link>.
          Numbers are deliberately round so the editorial choices are visible, not hidden behind a model.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mb-3">
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>World Cup win</span><span className="font-semibold tabular-nums">8.0</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>World Cup final lost</span><span className="font-semibold tabular-nums">3.0</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>World Cup semifinal (no final)</span><span className="font-semibold tabular-nums">0.75</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>Continental win (base, before tier)</span><span className="font-semibold tabular-nums">3.0</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>Continental final lost (base)</span><span className="font-semibold tabular-nums">1.0</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>Intercontinental win</span><span className="font-semibold tabular-nums">1.5</span>
          </div>
        </div>
        <p className="text-[var(--text-muted)] mb-2">
          Continental titles are not all equal. The base weight is multiplied by a tournament-tier factor:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 mb-3">
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>Euros / Copa América</span><span className="font-semibold tabular-nums">×1.0</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>AFCON</span><span className="font-semibold tabular-nums">×0.75</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>Asian Cup / Gold Cup</span><span className="font-semibold tabular-nums">×0.5</span>
          </div>
          <div className="flex items-baseline justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
            <span>OFC Nations Cup</span><span className="font-semibold tabular-nums">×0.3</span>
          </div>
        </div>
        <p className="text-[var(--text-muted)] text-xs">
          Intercontinental honors include the FIFA Confederations Cup, the King Fahd Cup, and
          Intercontinental honors include the FIFA Confederations Cup, the King Fahd Cup, and
          the Finalissima. Olympic football, the Central European International Cup, and the
          Pan-American Championship are surfaced as appearance history but do not contribute to
          this index. Future tournaments are excluded until they conclude.
        </p>
      </section>
    </main>
  );
}
