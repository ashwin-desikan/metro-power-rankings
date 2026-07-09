import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllBasketballNations, getBasketballHub, getEuroleague, getFibaRanking } from "@/lib/basketball";
import { flagCdnUrl, HISTORICAL_FLAG } from "@/lib/international-display";
import FibaRankingTable from "./FibaRankingTable";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/basketball";
const TITLE = "International Basketball";
const DESC =
  "National-team basketball: FIBA World Cup finals and campaigns, every Olympic podium since 1936, and the EuroLeague's complete club honours — with lineages folded into modern nations.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default function BasketballHubPage() {
  const hub = getBasketballHub();
  const nations = getAllBasketballNations();
  const el = getEuroleague();
  const fiba = getFibaRanking();
  if (!hub) return null;

  const slugByName = new Map(nations.map((t) => [t.name, t.slug]));
  // Former names (Soviet Union, Yugoslavia, Formosa, ...) link to the modern
  // node they fold into (Russia, Serbia, Chinese Taipei, ...).
  const lineageSlug = new Map<string, string>();
  for (const t of nations) {
    for (const former of t.lineage ?? []) lineageSlug.set(former, t.slug);
  }
  const flagFor = (name: string) => {
    // Current nations get their flag; predecessor names (only in lineage) get
    // the historical-entity marker, since flagcdn has no historical flags.
    const ownSlug = slugByName.get(name);
    const url = ownSlug ? flagCdnUrl(ownSlug) : null;
    if (url) return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" loading="lazy" decoding="async" />;
    if (lineageSlug.has(name)) return <span aria-hidden className="mr-1">{HISTORICAL_FLAG}</span>;
    return null;
  };
  const teamLink = (name: string, className?: string) => {
    const slug = slugByName.get(name) ?? lineageSlug.get(name);
    const label = <>{flagFor(name)}{name}</>;
    return slug ? (
      <Link href={`/teams/basketball/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {label}
      </Link>
    ) : (
      <span className={className}>{label}</span>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Basketball</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Basketball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The national-team game: FIBA World Cup finals and full campaigns for the
          editions on file, every Olympic podium since 1936, and pages for all{" "}
          {hub.totals.nations} nations — Soviet and Yugoslav lineages folded into
          their modern successors, attributed per edition.
        </p>
      </header>

      <HubNav
        items={[
          ...(fiba ? [{ label: "FIBA Ranking", href: "#fiba-ranking" }] : []),
          { label: "Olympic Podiums", href: "#olympics" },
          { label: "World Cup", href: "#world-cup" },
          { label: "Nations", href: "#nations" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- NBA card ---------------- */}
      <Link
        href="/teams/nba"
        className="block rounded-xl border p-4 mb-4 transition hover:border-[var(--accent)]"
        style={card}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">National Basketball Association →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              The world&apos;s top club league: every NBA (and BAA/ABA) champion and the
              all-time record of all 30 franchises, by metro.
            </div>
          </div>
          <div className="text-xs text-[var(--text-dim)]" style={mono}>
            United States &amp; Canada
          </div>
        </div>
      </Link>

      {/* ---------------- EuroLeague card ---------------- */}
      {el ? (
        <Link
          href="/teams/basketball/euroleague"
          className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
          style={card}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-base">EuroLeague →</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Europe&apos;s club crown: {el.seasons} seasons of champions, Final Four
                history, and the all-time table.
              </div>
            </div>
            {el.roll[0] ? (
              <div className="text-xs text-[var(--text-dim)]" style={mono}>
                Latest: {el.roll[0].champion} {el.roll[0].season}
              </div>
            ) : null}
          </div>
        </Link>
      ) : null}

      {/* ---------------- Domestic Basketball card ---------------- */}
      <Link
        href="/teams/basketball/domestic"
        className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
        style={card}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">Domestic Basketball →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Club basketball beyond the NBA and EuroLeague: the Chinese Basketball
              Association champions roll.
            </div>
          </div>
        </div>
      </Link>

      {/* ---------------- FIBA World Ranking ---------------- */}
      {fiba ? (
        <section className="mb-10">
          <h2 id="fiba-ranking" className="text-lg font-semibold mb-1">FIBA World Ranking</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            The current FIBA World Ranking for Men, presented by Nike — all{" "}
            {fiba.teams.length} ranked nations, filterable by FIBA zone. Updated as
            new rankings are published (as of {fiba.label}).
          </p>
          <FibaRankingTable ranking={fiba} />
        </section>
      ) : null}

      {/* ---------------- Olympics ---------------- */}
      <section className="mb-10">
        <h2 id="olympics" className="text-lg font-semibold mb-1">Olympic podiums</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every men&apos;s Olympic basketball podium since Berlin 1936.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[440px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Games</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Gold</th>
                <th className="py-2 px-3 font-medium">Silver</th>
                <th className="py-2 px-3 font-medium">Bronze</th>
              </tr>
            </thead>
            <tbody>
              {hub.podiums.map((p) => (
                <tr key={p.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{p.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(p.gold)}</td>
                  <td className="py-1.5 px-3">{p.silver ? teamLink(p.silver) : ""}</td>
                  <td className="py-1.5 px-3">{p.bronze ? teamLink(p.bronze) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- World Cup ---------------- */}
      <section className="mb-10">
        <h2 id="world-cup" className="text-lg font-semibold mb-1">FIBA World Cup finals</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Editions on file: {hub.wc_editions_on_file.join(", ")}.
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {hub.wc_finals.map((f) => (
                <tr key={f.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.year}</td>
                  <td className="py-2 px-3 font-semibold">{teamLink(f.champion)}</td>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{f.score}</td>
                  <td className="py-2 px-3">{teamLink(f.ru)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Nations ---------------- */}
      <section className="mb-10">
        <h2 id="nations" className="text-lg font-semibold mb-3">Nations</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Oly Gold</th>
                <th className="py-2 px-3 text-right font-medium">Oly Medals</th>
                <th className="py-2 px-3 text-right font-medium">WC Titles</th>
                <th className="py-2 px-3 text-right font-medium">WC Apps</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(t.slug) && (
                        <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" loading="lazy" decoding="async" />
                      )}
                      <Link href={`/teams/basketball/${t.slug}`} className="hover:text-[var(--accent)]">
                        {t.name}
                      </Link>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.gold > 0 ? GOLD : "var(--text-dim)" }}>{t.gold}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.medals}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.wc_titles}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.wc_apps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          World Cup campaigns parsed from the tournament record for the editions on
          file; championship-game results follow a reviewed canonical table (the source
          dump blends adjacent editions). Olympic podiums cover all 21 tournaments.
          Soviet Union and Unified Team results fold into Russia, Yugoslav lineages
          into Serbia, attributed per edition. Olympic gold is the headline honour on
          country cards, by editorial choice. EuroLeague club data comes from the
          season-by-season workbook sheet.
        </p>
      </section>
    </main>
  );
}
