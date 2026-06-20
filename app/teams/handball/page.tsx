import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllHandballTeams, getHandballHub } from "@/lib/handball";
import WorldRankingSection from "@/app/teams/_shared/WorldRankingSection";
import { getWorldRanking } from "@/lib/worldRankings";
import { flagCdnUrl, HISTORICAL_FLAG } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/handball";
const TITLE = "International Handball";
const DESC =
  "National-team handball: every Olympic men's podium (the ultimate trophy) and the IHF World Championship since 1938, with Soviet, Yugoslav and German lineages folded into modern nations.";

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

export default function HandballHubPage() {
  const hub = getHandballHub();
  const nations = getAllHandballTeams();
  if (!hub) return null;

  const slugByName = new Map(nations.map((t) => [t.name, t.slug]));
  const lineageSlug = new Map<string, string>();
  for (const t of nations) for (const f of t.lineage ?? []) lineageSlug.set(f, t.slug);

  const flagFor = (name: string) => {
    const ownSlug = slugByName.get(name);
    const url = ownSlug ? flagCdnUrl(ownSlug) : null;
    if (url) return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" />;
    if (lineageSlug.has(name)) return <span aria-hidden className="mr-1">{HISTORICAL_FLAG}</span>;
    return null;
  };
  const teamLink = (name: string) => {
    const slug = slugByName.get(name) ?? lineageSlug.get(name);
    const label = <>{flagFor(name)}{name}</>;
    return slug
      ? <Link href={`/teams/handball/${slug}`} className="hover:text-[var(--accent)]">{label}</Link>
      : <span>{label}</span>;
  };

  const podiumTable = (rows: { year: number; gold: string; silver: string; bronze: string }[]) => (
    <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
      <table className="w-full text-sm min-w-[520px]">
        <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 px-3 font-medium">Year</th>
            <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Gold</th>
            <th className="py-2 px-3 font-medium">Silver</th>
            <th className="py-2 px-3 font-medium">Bronze</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.year} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5 px-3 tabular-nums" style={mono}>{p.year}</td>
              <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(p.gold)}</td>
              <td className="py-1.5 px-3">{teamLink(p.silver)}</td>
              <td className="py-1.5 px-3">{teamLink(p.bronze)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Handball</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Handball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The national-team game: every men&apos;s Olympic podium — the sport&apos;s ultimate
          trophy — alongside the IHF World Championship since 1938. Soviet, Yugoslav and
          German lineages fold into their modern successors, attributed per edition.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Olympics", href: "#olympics" },
          { label: "World Championship", href: "#worlds" },
          { label: "World ranking", href: "#world-ranking" },
          { label: "Nations", href: "#nations" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      <Link href="/teams/handball/domestic"
        className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]" style={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">Domestic Handball →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Club handball&apos;s honours board: every Handball-Bundesliga champion.
            </div>
          </div>
        </div>
      </Link>

      <section className="mb-10">
        <h2 id="olympics" className="text-lg font-semibold mb-1">Olympic podiums</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The ultimate trophy. Men&apos;s Olympic handball: 1936, then every Games since 1972.
        </p>
        {podiumTable(hub.olympic_podiums)}
      </section>

      <section className="mb-10">
        <h2 id="worlds" className="text-lg font-semibold mb-1">IHF World Championship</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The biennial Worlds, the deepest record in the sport. {hub.totals.worlds_editions} editions since 1938.
        </p>
        {podiumTable(hub.worlds)}
      </section>

      <WorldRankingSection
        id="world-ranking"
        heading="Current world ranking"
        blurb="The live world ranking by points (handballranking.com)."
        ranking={getWorldRanking("handball-men")}
      />

      <section className="mb-10">
        <h2 id="nations" className="text-lg font-semibold mb-3">Nations</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[620px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Oly Gold</th>
                <th className="py-2 px-3 text-right font-medium">Oly Medals</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Worlds Gold</th>
                <th className="py-2 px-3 text-right font-medium">Worlds Medals</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(t.slug) ? <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" /> : null}
                      <Link href={`/teams/handball/${t.slug}`} className="hover:text-[var(--accent)]">{t.name}</Link>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.oly_gold > 0 ? GOLD : "var(--text-dim)" }}>{t.oly_gold}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.oly_medals}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.worlds_gold}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.worlds_medals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Olympic men&apos;s handball podiums (field handball in 1936, indoor from 1972) and
          the IHF World Championship from 1938. The Soviet Union and the Unified Team fold
          into Russia; Yugoslavia and FR Yugoslavia into Serbia; West Germany into Germany;
          Czechoslovakia into the Czech Republic, attributed per edition. East Germany is
          kept as its own nation. Olympic gold is the headline honour; nations are ranked by it.
        </p>
      </section>
    </main>
  );
}
