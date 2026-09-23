import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, serializeJsonLd, ogImage } from "@/lib/seo";
import { getFanIndex } from "@/lib/fanIndex";
import { FansCrumbs, FansNav, TabHeader, MONO } from "./_shared/ui";
import FanTable, { type FanTableTeam } from "./FanTable";

export const dynamicParams = false;

const PAGE_PATH = "/fans";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Fan Attention Index";
const PAGE_DESCRIPTION =
  "The annual attention sports teams earn on Wikipedia, across every language edition: a public, reproducible measure of attention, not a fan count. Football, the major American leagues (NFL, NBA, MLB, NHL, college football, college basketball), and the rest of the world's sports (WNBA, women's football, EuroLeague, AFL, NRL, IPL, Formula 1, NPB, CFL, Top 14, Handball-Bundesliga, SuperLega), ranked within their own group and across sports on one shared scale.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

function windowLabel(start: string, end: string): string {
  const fmt = (ym: string) => {
    const [y, m] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

export default function FansPage() {
  const data = getFanIndex();
  const teams: FanTableTeam[] = data.teams.map((t) => ({
    team: t.team,
    displayName: t.displayName,
    href: t.href,
    group: t.group,
    league: t.league,
    category: t.category,
    wikiBaseline12m: t.wikiBaseline12m,
    scoreInGroup: t.scoreInGroup,
    rankInGroup: t.rankInGroup,
    rankInLeague: t.rankInLeague,
    globalScore: t.globalScore,
    globalRank: t.globalRank,
    inFlux: t.inFlux,
    inclusionRule: t.inclusionRule,
    spikeRatio: t.spikeRatio,
    monthly: t.monthly,
    valueM: t.valueM,
    valSource: t.valSource,
    valYear: t.valYear,
    residualPct: t.residualPct,
    residualEligible: t.residualEligible,
  }));

  const winLabel = windowLabel(data.window.start, data.window.end);
  const stamp = `Wikimedia Pageviews API · window ${winLabel} · ${data.teams.length} teams · v${data.version.replace(/^v/i, "")}`;

  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    identifier: PAGE_URL,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: { "@type": "Organization", name: "Citizen of Nowhere", url: BASE_URL },
    version: data.version,
    dateModified: data.generated,
    temporalCoverage: `${data.window.start}/${data.window.end}`,
    isAccessibleForFree: true,
    variableMeasured: [
      "All-language Wikipedia pageviews, human traffic only (12-month median baseline x 12)",
      "Attention score, within group (0-100)",
      "Global attention score, across every team (0-100, share of the top team)",
    ],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${BASE_URL}/data/fans/fan-attention.json`,
    },
    citation: `Citizen of Nowhere, Fan Attention Index ${data.version} (2026), rankings.citizenofnowhere.org/fans`,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(datasetJsonLd) }}
      />
      <FansCrumbs />
      <TabHeader
        emoji="🎟️"
        title={PAGE_TITLE}
        sub="The annual attention each team earns on Wikipedia across every language, a public, reproducible measure of attention, not a fan count."
        stamp={stamp}
      />
      <FansNav active="index" />

      <FanTable teams={teams} />

      <p className="text-xs text-[var(--text-dim)] mt-4" style={MONO}>
        Version {data.version}, data window {winLabel}. * = residual not shown; this group&apos;s
        attention-to-value fit is too weak (R&sup2; &lt; 0.4) to be meaningful. &Dagger; = added to
        the index by a stated inclusion rule rather than by conference membership alone; hover the
        mark for the rule. See{" "}
        <Link href="/fans/methodology" className="hover:underline text-[var(--text-muted)]">Methodology</Link>.
      </p>

      <div className="mt-8 pt-6 border-t rounded-2xl" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold mb-2 text-[var(--text)]">Where these numbers come from</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl">
          Every figure on this page starts from the Wikimedia Pageviews API (human traffic only,
          <code className="mx-1">agent=user</code>) and each team&apos;s Wikidata sitelinks, summed across
          every language edition of Wikipedia. For most groups that Wikipedia baseline is blended with a
          Google Trends search-interest signal; a small number of groups whose team names collide with
          common words (football, AFL, F1, NRL, college football and college basketball) are scored on
          Wikipedia alone, because Trends cannot tell the team from the word. Full method, sources,
          caveats and per-group regression fit are on the{" "}
          <Link href="/fans/methodology" className="hover:underline text-[var(--accent)]">Methodology</Link> page.
        </p>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl mt-2">
          Suggested citation: <em>Citizen of Nowhere, Fan Attention Index {data.version} (2026), rankings.citizenofnowhere.org/fans</em>.
          Released under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent)]">CC BY 4.0</a>.
        </p>
      </div>
    </main>
  );
}
