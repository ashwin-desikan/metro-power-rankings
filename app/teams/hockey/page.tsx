import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllHockeyTeams, getHockeyHub } from "@/lib/hockey";
import { flagCdnUrl, HISTORICAL_FLAG } from "@/lib/international-display";
import { getWorldRanking } from "@/lib/worldRankings";
import WorldRankingSection from "@/app/teams/_shared/WorldRankingSection";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/hockey";
const TITLE = "International Ice Hockey";
const DESC =
  "National-team ice hockey: every Olympic podium since 1920 (the ultimate trophy), the Canada Cup and World Cup of Hockey, and the annual IIHF World Championship — with Soviet and Czechoslovak lineages folded into modern nations.";

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

export default function HockeyHubPage() {
  const hub = getHockeyHub();
  const nations = getAllHockeyTeams();
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
      ? <Link href={`/teams/hockey/${slug}`} className="hover:text-[var(--accent)]">{label}</Link>
      : <span>{label}</span>;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>International Ice Hockey</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">International Ice Hockey</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The national-team game: every Olympic podium since 1920 — the sport&apos;s
          ultimate trophy — alongside the Canada Cup and World Cup of Hockey and the
          annual IIHF World Championship. Soviet and Czechoslovak lineages fold into
          their modern successors, attributed per edition.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Olympics", href: "#olympics" },
          { label: "World Cup", href: "#world-cup" },
          { label: "World Championship", href: "#worlds" },
          { label: "World ranking", href: "#world-ranking" },
          { label: "Nations", href: "#nations" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- NHL card ---------------- */}
      <Link
        href="/teams/nhl"
        className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
        style={card}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">National Hockey League →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              The top club league: every Stanley Cup champion and the all-time record of
              all 32 franchises, by metro.
            </div>
          </div>
          <div className="text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            United States &amp; Canada
          </div>
        </div>
      </Link>

      {/* ---------------- Domestic Hockey card ---------------- */}
      <Link
        href="/teams/hockey/domestic"
        className="block rounded-xl border p-4 mb-8 transition hover:border-[var(--accent)]"
        style={card}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-base">Domestic Hockey →</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Club ice hockey beyond the NHL: the KHL&apos;s Gagarin Cup winners.
            </div>
          </div>
        </div>
      </Link>

      {/* ---------------- Olympics (ultimate) ---------------- */}
      <section className="mb-10">
        <h2 id="olympics" className="text-lg font-semibold mb-1">Olympic podiums</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The ultimate trophy. Men&apos;s Olympic ice hockey, every Games since 1920.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Gold</th>
                <th className="py-2 px-3 font-medium">Silver</th>
                <th className="py-2 px-3 font-medium">Bronze</th>
              </tr>
            </thead>
            <tbody>
              {hub.olympic_podiums.map((p) => (
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
      </section>

      {/* ---------------- World Cup / Canada Cup ---------------- */}
      <section className="mb-10">
        <h2 id="world-cup" className="text-lg font-semibold mb-1">Canada Cup &amp; World Cup of Hockey</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The best-on-best invitational: the Canada Cup (1976-1991) and its successor,
          the World Cup of Hockey (1996-2016).
        </p>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Event</th>
                <th className="py-2 px-3 font-medium">Champion</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {hub.world_cup.map((w) => (
                <tr key={w.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{w.year}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{w.event}</td>
                  <td className="py-2 px-3 font-semibold">{teamLink(w.champion)}</td>
                  <td className="py-2 px-3">{teamLink(w.ru)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- IIHF World Championship ---------------- */}
      <section className="mb-10">
        <h2 id="worlds" className="text-lg font-semibold mb-1">IIHF World Championship</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The annual Worlds, held nearly every year since 1920. The least weighty of the
          three honours, but the deepest record. {hub.totals.worlds_editions} editions.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Gold</th>
                <th className="py-2 px-3 font-medium">Silver</th>
                <th className="py-2 px-3 font-medium">Bronze</th>
              </tr>
            </thead>
            <tbody>
              {hub.worlds.map((w) => (
                <tr key={w.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{w.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>{teamLink(w.gold)}</td>
                  <td className="py-1.5 px-3">{teamLink(w.silver)}</td>
                  <td className="py-1.5 px-3">{teamLink(w.bronze)}</td>
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
        blurb="The live IIHF men's ranking by points."
        ranking={getWorldRanking("hockey-men")}
      />

      {/* ---------------- Nations ---------------- */}
      <section className="mb-10">
        <h2 id="nations" className="text-lg font-semibold mb-3">Nations</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[680px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Nation</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Oly Gold</th>
                <th className="py-2 px-3 text-right font-medium">Oly Medals</th>
                <th className="py-2 px-3 text-right font-medium">World Cups</th>
                <th className="py-2 px-3 text-right font-medium">Worlds Gold</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {flagCdnUrl(t.slug) ? <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" /> : null}
                      <Link href={`/teams/hockey/${t.slug}`} className="hover:text-[var(--accent)]">{t.name}</Link>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: t.oly_gold > 0 ? GOLD : "var(--text-dim)" }}>{t.oly_gold}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.oly_medals}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.wc_titles}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.worlds_gold}</td>
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
          Olympic men&apos;s podiums cover every Games from Antwerp 1920 to Milano-Cortina
          2026; the Canada Cup and World Cup of Hockey span 1976-2016; the IIHF World
          Championship is the annual record. Soviet Union, the Unified Team, ROC, and the
          Olympic Athletes from Russia fold into Russia; Czechoslovakia and Czechia into
          the Czech Republic; West Germany into Germany, attributed per edition. Olympic
          gold is the headline honour, by editorial choice; nations are ranked by it.
        </p>
      </section>
    </main>
  );
}
