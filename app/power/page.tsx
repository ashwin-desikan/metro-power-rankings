import type { Metadata } from "next";
import Link from "next/link";
import { getPowerRanking } from "@/lib/powerRanking";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PowerTable from "./PowerTable";

const PATH = "/power";
const TITLE = "The Nowhere 100";
const DESC =
  "The Nowhere 100 is an opinionated, point-in-time ranking of the 100 most powerful people in the world, scoring each by the Metro Power score of the place or institution behind them and how much control they actually hold: heads of state, legislators, governors and mayors, judges, central bankers, alliance and multilateral chiefs, corporate, financial, media, sporting and cultural leaders, and billionaires.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website", images: [{ url: "/og-power.png", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC, images: ["/og-power.png"] },
};

function formatAsOf(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

import IndexSwitcher from "@/app/IndexSwitcher";
import { getPowerRankHistory } from "@/lib/powerRankHistory";

export default async function PowerPage() {
  const data = await getPowerRanking();
  const rows = data?.ranking ?? [];

  const hist = getPowerRankHistory();
  return (
    <main className="mx-auto max-w-4xl px-4 pb-8 pt-4">
      <div className="mb-4"><IndexSwitcher current="people" /></div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>The Nowhere 100</span>
      </nav>

      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <span className="text-[var(--text-dim)]">See also:</span>
        <Link href="/billionaires" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Billionaires</Link>
        <Link href="/mayors" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Mayors of the World</Link>
        <Link href="/leaders" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">World Leaders</Link>
        <Link href="/elections" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Elections</Link>
        <Link href="/us-political-leadership" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">US Political Leadership</Link>
        <Link href="/uk-political-leadership" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">UK Political Leadership</Link>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <img src="/nowhere-100-seal.svg" alt="The Nowhere 100 seal" width={64} height={70} className="flex-shrink-0" style={{ height: 70, width: 64 }} loading="lazy" decoding="async" />
          <h1 className="text-3xl font-bold text-[var(--text)]">{TITLE}</h1>
        </div>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        {formatAsOf(data?.asOf) && (
          <p className="text-xs text-[var(--text-dim)] mt-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Snapshot as of {formatAsOf(data?.asOf)}. A point-in-time estimate, updated weekly.
          </p>
        )}
      </header>

      {rows.length ? (
        <PowerTable rows={rows} dropped={data?.dropped ?? []} prevSnapshotDate={data?.prevSnapshotDate ?? null}
                    history={hist.series} historyDates={hist.dates} />
      ) : (
        <p className="text-[var(--text-muted)]">Ranking unavailable.</p>
      )}

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)] space-y-2" style={{ borderColor: "var(--border)" }}>
        <p>
          <strong>Method.</strong> Power = the Metro Power score of a person&rsquo;s jurisdiction × an influence weight for how much control
          they hold. National leaders scale with the V-Dem Liberal Democracy Index (a checked democracy counts for about half its country, an
          autocrat for nearly all of it), with a geopolitical multiplier for energy and military powers whose clout outruns their metros. Media, sport-governance and cultural figures are scored on estimated global reach rather than a jurisdiction, a deliberately softer and more contestable measure.
          Governors, mayors, judges, central bankers, alliance and multilateral chiefs, corporate, financial and cultural leaders, and billionaires each carry their own weight; billionaires
          convert net worth into the same scale at a discount. Use the Office &amp; wealth toggle to hide the softer, symbolic categories. It is deliberately opinionated, not a definitive measure.
        </p>
        <p>⏳ marks a leadership change or election expected within about six months. Recomputed weekly from the live feeds.</p>
      </footer>
    </main>
  );
}
