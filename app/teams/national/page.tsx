import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import {
  getAllNationalTeams,
  getAllTournamentHubs,
  getWorldCup2026,
  getRankSnapshots,
} from "@/lib/international";
import {
  centroidForTeam,
  TOURNAMENT_HUB_ORDER,
  countryPageSlugFor,
} from "@/lib/international-display";
import { getAllCountrySlugs } from "@/lib/countries";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import NationalIndexClient, { type IndexTeam } from "./NationalIndexClient";
import WorldCup2026 from "./WorldCup2026";

export const metadata: Metadata = {
  title: "International Football",
  description:
    "Canonical pages for every senior men's national football team with tournament history on file, plus hubs for the FIFA World Cup, all six continental cups, and intercontinental tournaments. A sibling product to the metro-anchored Club Football pages.",
  alternates: { canonical: "/teams/national" },
  openGraph: {
    title: `International Football | ${SITE_NAME}`,
    description:
      "Senior national-team pages, all-time tournament hubs, and trophy history sourced from the grand football workbook.",
    url: `${BASE_URL}/teams/national`,
    type: "website",
  },
};

export default function NationalIndexPage() {
  const teams = getAllNationalTeams();
  const hubs = getAllTournamentHubs();
  const wc2026 = getWorldCup2026();
  const snapshots = getRankSnapshots();
  const countrySlugSet = new Set(getAllCountrySlugs());

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
          <h1 className="text-3xl font-semibold tracking-tight">International Football</h1>
          <Link
            href="/teams/national/quiz"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            Try the honors quiz →
          </Link>
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
          { label: "Tournament Hubs", href: "#tournaments" },
          { label: "National Teams", href: "#national-teams" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {wc2026 && <WorldCup2026 wc={wc2026} />}

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
          the Finalissima. Olympic football, the Central European International Cup, and the
          Pan-American Championship are surfaced as appearance history but do not contribute to
          this index. Future tournaments are excluded until they conclude.
        </p>
      </section>
    </main>
  );
}
