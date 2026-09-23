import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, serializeJsonLd, ogImage } from "@/lib/seo";
import { getFanIndex, RESIDUAL_ELIGIBLE_GROUPS } from "@/lib/fanIndex";
import { FansCrumbs, FansNav, TabHeader, MONO } from "./_shared/ui";
import FanTable, { type FanTableTeam } from "./FanTable";

export const dynamicParams = false;

const PAGE_PATH = "/fans";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Fan Attention Index";
const PAGE_DESCRIPTION =
  "The annual attention 224 sports teams earn on Wikipedia across every language edition: a public, reproducible measure of attention, not a fan count. NFL, NBA, MLB, NHL, MLS, WNBA, NWSL, Formula 1, European football and Liga MX, ranked within their own group.";

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
    baseline_12m: t.baseline_12m,
    all_lang_views_12m: t.all_lang_views_12m,
    lang_count: t.lang_count,
    spike_ratio: t.spike_ratio,
    attention_score: t.attention_score,
    rank_in_group: t.rank_in_group,
    monthly: t.monthly,
    value_m: t.value_m,
    val_source: t.val_source,
    val_year: t.val_year,
    residual_pct: t.residual_pct,
    residual_eligible: RESIDUAL_ELIGIBLE_GROUPS.has(t.group),
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
      "All-language Wikipedia pageviews (12-month baseline)",
      "English Wikipedia pageviews (12-month)",
      "Wikipedia language edition count",
      "Attention score (0-100, within group)",
    ],
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${BASE_URL}/data/fans/fan-attention.json`,
    },
    citation: "Citizen of Nowhere, Fan Attention Index v0.1 (2026), rankings.citizenofnowhere.org/fans",
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

      <FanTable teams={teams} groups={data.groups} />

      <p className="text-xs text-[var(--text-dim)] mt-4" style={MONO}>
        Version {data.version}, data window {winLabel}. * = residual not shown; this group&apos;s
        attention-to-value fit is too weak (R&sup2; &lt; 0.4) to be meaningful. See{" "}
        <Link href="/fans/methodology" className="hover:underline text-[var(--text-muted)]">Methodology</Link>.
      </p>

      <div className="mt-8 pt-6 border-t rounded-2xl" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold mb-2 text-[var(--text)]">Where these numbers come from</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl">
          Every figure on this page is built from the Wikimedia Pageviews API (human traffic only,
          <code className="mx-1">agent=user</code>) and each team&apos;s Wikidata sitelinks, summed across
          every language edition of Wikipedia. No survey or third-party popularity index is used. Full method,
          sources, caveats and per-group regression fit are on the{" "}
          <Link href="/fans/methodology" className="hover:underline text-[var(--accent)]">Methodology</Link> page.
        </p>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl mt-2">
          Suggested citation: <em>Citizen of Nowhere, Fan Attention Index v0.1 (2026), rankings.citizenofnowhere.org/fans</em>.
          Released under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent)]">CC BY 4.0</a>.
        </p>
      </div>
    </main>
  );
}
