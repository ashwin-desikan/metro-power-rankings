import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { FansCrumbs, FansNav, TabHeader } from "../_shared/ui";

export const dynamicParams = false;

const PAGE_PATH = "/fans/methodology";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Fan Attention Index: Methodology";
const PAGE_DESCRIPTION =
  "How the Fan Attention Index is built: Wikipedia pageviews by language, the spike-dampened baseline, the attention score, the valuation join, and what the index cannot tell you.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

// Log-log R^2 of value_m ~ baseline_12m, fit per group. See
// scripts/fans/README.md (revision 3, "Regression: value_m ~ baseline_12m").
const GROUP_R2: { group: string; n: number; r2: string }[] = [
  { group: "European football", n: 43, r2: "0.881" },
  { group: "MLB", n: 30, r2: "0.563" },
  { group: "NBA", n: 30, r2: "0.486" },
  { group: "NFL", n: 32, r2: "0.471" },
  { group: "MLS", n: 30, r2: "0.267" },
  { group: "F1", n: 10, r2: "0.203" },
  { group: "WNBA/NWSL", n: 10, r2: "0.126" },
  { group: "NHL", n: 32, r2: "0.078" },
  { group: "Liga MX", n: 3, r2: "~0.000 (n too small to be meaningful)" },
];

export default function FansMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <FansCrumbs tab="Methodology" />
      <TabHeader
        emoji="🎟️"
        title="Fan Attention Index: Methodology"
        sub="How the index is built, what it measures, and what it does not."
      />
      <FansNav active="methodology" />

      <div className="prose-fans text-[15px] text-[var(--text-muted)] space-y-6">
        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">What this measures</h2>
          <p>
            The Fan Attention Index is a read of how much attention a sports team gets on Wikipedia,
            across every language edition, over a full year. It is not a fan count and it is not a
            survey. It is a direct tally of page requests to that team&apos;s Wikipedia article, from
            humans, not bots, across as many as 143 language editions for one club.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Sources</h2>
          <p>
            Team resolution uses the English Wikipedia API to find each team&apos;s canonical article
            and its Wikidata QID. Pageviews come from the Wikimedia Pageviews API
            (<code>per-article</code>, all-access, <code>agent=user</code>), which counts only human
            traffic and excludes bots and spiders. Language editions come from the sitelinks listed
            on the team&apos;s Wikidata item. Every request carries an identifying User-Agent, as
            Wikimedia&apos;s API etiquette requires.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Window</h2>
          <p>
            Twelve full months, September 2025 through August 2026, at monthly granularity. Every
            team is measured on the same window, so the comparison across teams and leagues is
            apples to apples.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">The baseline</h2>
          <p>
            A team&apos;s raw twelve-month view total can be dominated by one viral month: a title
            run, a trade, a rename. To give a steadier read, the index uses a spike-dampened
            baseline instead of the raw sum. The baseline is the team&apos;s median monthly
            all-language view count, multiplied by twelve. It answers &quot;what would this year have
            summed to at a typical month&apos;s pace,&quot; rather than letting one news cycle carry
            the whole total.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Spike ratio</h2>
          <p>
            The spike ratio is a team&apos;s busiest month divided by its median month. A ratio at or
            above 2.5 is marked with a small lightning icon on the index: it flags a year with one
            unusually loud month, not a team with weak underlying interest. A high spike ratio can
            also mean a genuine, sustained shift, such as a rename or relocation, rather than a
            single-month event. Read the marker as a prompt to look closer, not as a verdict.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Attention score</h2>
          <p>
            The attention score is the baseline, scaled to the top team in its own group. The group
            leader scores 100.0; every other team in that group scores its baseline as a percentage
            of the leader&apos;s baseline, to one decimal place. The score only compares teams within
            the same group; it does not attempt to compare, say, an NHL team&apos;s score against an
            NFL team&apos;s, because the two groups have very different absolute scales.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Valuation and the attention-to-value line</h2>
          <p>
            Each team is joined to its franchise valuation from this site&apos;s valuations dataset,
            where one exists (220 of 224 teams). Within each group, a log-log ordinary least squares
            line is fit between the baseline and the valuation. The fitted line gives a predicted
            valuation for each team from its attention alone, and the &quot;vs attention&quot; column
            on the index is the percentage gap between the team&apos;s actual valuation and that
            prediction: positive means the team is valued above what its attention alone would
            predict, negative means below.
          </p>
          <p>
            That comparison is only shown where the group&apos;s fit is strong enough to trust, R
            squared at or above 0.4. Below that line, the fitted line explains too little of the
            group&apos;s spread in valuations for a per-team gap to mean much, so the index shows
            &quot;n/a&quot; instead of a number that looks precise but is not. The fits, per group:
          </p>
          <div className="overflow-x-auto rounded-xl border mt-3" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm" data-static-sort="fixed reference table, not a ranked board">
              <thead>
                <tr className="text-left text-[var(--text-dim)]">
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium text-right">n</th>
                  <th className="px-3 py-2 font-medium text-right">R&sup2;</th>
                  <th className="px-3 py-2 font-medium text-right">Residual shown</th>
                </tr>
              </thead>
              <tbody>
                {GROUP_R2.map((g) => (
                  <tr key={g.group} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">{g.group}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.n}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.r2}</td>
                    <td className="px-3 py-2 text-right">
                      {parseFloat(g.r2) >= 0.4 ? "Yes" : "No, shown as n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Attention explains franchise value well within European football, an almost mechanical
            relationship, likely because European club value is itself driven heavily by global fan
            reach and media rights, which pageviews also track. It explains value moderately for the
            big three US leagues that clear the 0.4 line. It explains very little for the NHL,
            WNBA and NWSL, Formula 1, MLS or Liga MX, whose valuations are set by factors such as
            media rights deals, ownership scarcity and arena economics that do not show up in
            Wikipedia traffic.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Limits</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-[var(--text)]">Attention is not fandom.</strong> Wikipedia is a
              reference and lookup surface, not a ticket-buying or merchandise-buying surface. It
              captures casual and news-driven interest well and under-represents passionate fan
              bases that are less likely to look a team up on Wikipedia, particularly younger,
              social-media-native audiences.
            </li>
            <li>
              <strong className="text-[var(--text)]">News and event spikes.</strong> Wikipedia
              traffic reacts sharply to single events: trades, coaching changes, scandals, deep
              playoff runs. A twelve-month total, even the spike-dampened baseline, can still
              overweight a team that had one unusually loud stretch relative to a team with steadier,
              lower-amplitude attention.
            </li>
            <li>
              <strong className="text-[var(--text)]">Relocations and renames.</strong> The Athletics
              and Utah Mammoth are tracked under their current article titles. Readers and searchers
              converging on a freshly renamed or relocating team&apos;s article can itself look like
              a genuine popularity spike or dip, when it is really a naming or URL artifact.
            </li>
            <li>
              <strong className="text-[var(--text)]">Language skew.</strong> US teams skew heavily
              toward English-language traffic, while European football clubs are followed across
              dozens of non-English Wikipedias. That difference in language breadth, not just
              difference in popularity, is a large part of why European clubs lead the whole 224-team
              set on raw and baseline attention.
            </li>
            <li>
              <strong className="text-[var(--text)]">F1 constructor articles.</strong> The Mercedes
              and Aston Martin Formula One articles cover each brand&apos;s full history in the sport,
              not only its current-era entry, since no other dedicated current-team article exists
              for either. Their attention totals include some volume from earlier F1 stints under the
              same name.
            </li>
            <li>
              <strong className="text-[var(--text)]">Mixed valuation sources and vintages.</strong>
              Valuations come from more than one publisher, with different methodologies for what
              counts toward a franchise&apos;s value, and most but not all figures are from 2026;
              some entries reflect 2023 through 2025 editions. Cross-league comparisons of the
              &quot;vs attention&quot; figure should be read with that in mind.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Citing this dataset</h2>
          <p>
            Suggested citation: <em>Citizen of Nowhere, Fan Attention Index v0.1 (2026),
            rankings.citizenofnowhere.org/fans</em>. Released under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent)]">CC BY 4.0</a>.
          </p>
          <p>
            <Link href="/fans" className="hover:underline text-[var(--accent)]">Back to the Fan Attention Index &rarr;</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
