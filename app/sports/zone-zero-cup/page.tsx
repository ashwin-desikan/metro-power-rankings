import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getZoneZeroNations, getZoneZeroMeta, getZoneZeroRegions } from "@/lib/zoneZeroCup";
import HubNav from "@/app/teams/HubNav";
import ZoneZeroTable, { type ZzcRow } from "./ZoneZeroTable";
import { flagCdnUrl } from "@/lib/international-display";

export const dynamicParams = false;

const PATH = "/sports/zone-zero-cup";
const TITLE = "Zone Zero Cup";
const DESC =
  "A single ranking of national sporting merit across fourteen sport pillars, modelled on the NACDA Directors' Cup but built for nations. It blends decayed achievement with current world rankings, weights recency hard, and is published in overall, per-capita and per-GDP views.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

import IndexSwitcher from "@/app/IndexSwitcher";

// ISR: the Cup is regenerated weekly and committed with [vercel skip]; this
// re-reads it from GitHub raw within the window, so no build is needed.
export const revalidate = 3600;

export default async function ZoneZeroCupPage() {
  const nations = await getZoneZeroNations();
  const meta = await getZoneZeroMeta();
  const regions = await getZoneZeroRegions();

  const rows: ZzcRow[] = nations.map((n) => ({
    slug: n.slug,
    countrySlug: n.countrySlug,
    name: n.name,
    continent: n.continent,
    merit: n.merit,
    rank: n.rank,
    meritPerCapita: n.meritPerCapita,
    rankPerCapita: n.rankPerCapita,
    meritPerGdp: n.meritPerGdp,
    rankPerGdp: n.rankPerGdp,
    majorTitles: n.majorTitles,
    bestRank: n.bestRank,
    bestRankSport: n.bestRankSport,
    topSports: n.topSports,
    sportMerit: n.sportMerit,
    sportRank: n.sportRank,
    nationalSports: n.nationalSports,
    suspended: n.suspended,
    defunct: n.defunct,
  }));

  // Sport dropdown ordered by total merit across all nations (biggest first)
  const sportTotals = new Map<string, number>();
  for (const n of nations) {
    for (const [sp, pts] of Object.entries(n.sportMerit)) {
      sportTotals.set(sp, (sportTotals.get(sp) ?? 0) + pts);
    }
  }
  const sports = Array.from(sportTotals.keys()).sort(
    (a, b) => (sportTotals.get(b) ?? 0) - (sportTotals.get(a) ?? 0),
  );

  const podium = [...nations].sort((a, b) => a.rank - b.rank).slice(0, 3);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pt-24">
      <div className="mb-4"><IndexSwitcher current="countries" /></div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Zone Zero Cup</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-2xl">🏆</span>
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: GOLD }}>
            National sporting merit
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Zone Zero Cup</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          One ranking of every nation&apos;s sporting merit, modelled on the NACDA Directors&apos; Cup
          but built for countries. It counts each nation&apos;s best results across the Olympic
          programme and the major team sports, blends them with current world rankings, and weights
          recent achievement far more heavily than distant history, so the table reflects how nations
          stand today rather than a century of accumulated medals. Read it overall, or switch to the
          per-capita and per-GDP views to see who punches above their size.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] mt-3">
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{meta.count}</strong> nations ranked
          </div>
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>14</strong> sport pillars
          </div>
          <div>
            recency half-life <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{meta.method.halflife}y</strong>
          </div>
        </div>
      </header>

      <HubNav
        items={[
          { label: "Rankings", href: "#rankings" },
          { label: "How it's scored", href: "#scoring" },
        ]}
      />

      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {podium.map((p, i) => {
          const body = (
            <>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">#{p.rank}</div>
              <div className="flex items-center gap-2 mt-1">
                {flagCdnUrl(p.slug, "40x30") ? <img src={flagCdnUrl(p.slug, "40x30")!} alt="" width={26} height={19} className="rounded-[2px] flex-shrink-0" style={{ objectFit: "cover" }} loading="lazy" decoding="async" /> : null}
                <span className="font-semibold text-sm sm:text-base leading-tight">{p.name}</span>
              </div>
              <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{p.continent}</div>
              <div className="text-lg sm:text-xl font-bold tabular-nums mt-2" style={{ ...mono, color: GOLD }}>
                {p.merit.toFixed(0)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                {p.topSports.slice(0, 3).map((s) => s.sport).join(", ")}
              </div>
            </>
          );
          const cls = "rounded-xl border p-3 sm:p-4 transition-colors";
          const style = { backgroundColor: "var(--bg-card)", borderColor: i === 0 ? GOLD : "var(--border)" } as const;
          return p.countrySlug ? (
            <Link key={p.slug} href={`/countries/${p.countrySlug}`} className={`${cls} hover:border-[var(--accent)]`} style={style}>
              {body}
            </Link>
          ) : (
            <div key={p.slug} className={cls} style={style}>
              {body}
            </div>
          );
        })}
      </div>

      <section id="rankings" className="mb-12 scroll-mt-24">
        <h2 className="text-lg font-semibold mb-1">The ranking</h2>
        <p className="text-[var(--text-muted)] text-sm mb-4 max-w-3xl">
          The full table of every ranked nation. Switch the ranking basis, filter by region, and sort
          by merit or current world ranking.
        </p>
        <ZoneZeroTable rows={rows} regions={regions} sports={sports} />
      </section>

      <section id="scoring" className="mb-12 scroll-mt-24">
        <h2 className="text-lg font-semibold mb-3">How it&apos;s scored</h2>
        <div className="max-w-3xl text-sm text-[var(--text-muted)] space-y-3">
          <p>
            Every medal, title and final is converted to points on one scale, where winning a sport&apos;s
            flagship world title is the anchor. Each result is then weighted by recency on an exponential
            decay with an {meta.method.halflife}-year half-life, so a result from two decades ago counts
            only a fraction of a recent one. A nation&apos;s score is the sum of its best{" "}
            {meta.method.cap} sports, which rewards both breadth and depth without letting one sport dominate.
          </p>
          <p>
            Five deliberate adjustments shape the table. The flagship world titles of the globally
            contested team sports carry a {meta.method.flagshipBoost}× weight, since a World Cup is a
            single winner-take-all event rather than one of dozens of Olympic golds. Winter Olympic
            results are weighted at {meta.method.winterWeight}× their summer equivalents, reflecting a
            smaller and less global field. High-volume Olympic sports face diminishing returns so medal
            count alone cannot run away. Live world rankings feed a present-day strength signal, so a
            nation strong right now is rewarded even between titles. And nations under blanket
            international suspension take an inactivity decay for every cycle they miss.
          </p>
          <p>
            The full method, including the per-sport weights, is on the{" "}
            <Link href="/methodology#zone-zero-cup" className="text-[var(--accent)] hover:underline">
              methodology page
            </Link>
            . Figures are a model, not an official record.
          </p>
        </div>
      </section>
    </main>
  );
}
