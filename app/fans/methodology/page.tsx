import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { getFanIndex } from "@/lib/fanIndex";
import { FansCrumbs, FansNav, TabHeader } from "../_shared/ui";

export const dynamicParams = false;

const PAGE_PATH = "/fans/methodology";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Fan Attention Index: Methodology";
const PAGE_DESCRIPTION =
  "How the Fan Attention Index is built: Wikipedia pageviews by language, the spike-dampened baseline, the entity check, the in-flux weighting, the global cross-sport scale, and what the index cannot tell you.";

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

export default function FansMethodologyPage() {
  const data = getFanIndex();
  const groupsWithValuation = Array.from(
    new Set(data.teams.filter((t) => t.valueM != null).map((t) => t.group)),
  ).sort();
  const eligible = groupsWithValuation.filter((g) => data.residualEligibleGroups.has(g));
  const notEligible = groupsWithValuation.filter((g) => !data.residualEligibleGroups.has(g));

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
            across every language edition. It is not a fan count and it is not a survey. It is a
            direct tally of page requests to a team&apos;s Wikipedia article, from humans, not bots,
            across as many as 143 language editions for one club.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Sources</h2>
          <p>
            Team resolution uses the English Wikipedia API to find each team&apos;s canonical article
            and its Wikidata QID. Every team then passes an entity check against Wikidata: its
            instance-of and sport claims must actually match the team it is supposed to be, so a
            resolver mistake (a disambiguation page, a same-named unrelated topic) is caught before it
            enters the index rather than silently inflating a team&apos;s numbers. Pageviews come from
            the Wikimedia Pageviews API (<code>per-article</code>, all-access, <code>agent=user</code>),
            which counts only human traffic and excludes bots and spiders. Redirect traffic (a reader
            landing on an old title that forwards to the current article) is not separately tracked or
            added in; the count is whatever the Pageviews API reports for the canonical title itself.
            Language editions come from the sitelinks listed on the team&apos;s Wikidata item. Every
            request carries an identifying User-Agent, as Wikimedia&apos;s API etiquette requires.
          </p>
          <p>
            A Wikidata social-following count (property P8687) was tried as a second signal and
            dropped: the figures on file were stale and inconsistent across teams, sometimes years
            out of date and sometimes missing entirely for a team with obvious mainstream reach, so
            folding them in would have made the index less accurate, not more. The index is
            Wikipedia-only.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Window</h2>
          <p>
            Twelve full months, September 2025 through August 2026, at monthly granularity. Every
            team is measured on the same window, and the baseline below is computed from the same
            twelve months, so the comparison across teams and leagues is apples to apples.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">The baseline</h2>
          <p>
            A team&apos;s raw twelve-month view total can be dominated by one viral month: a title
            run, a trade, a rename. To give a steadier read, the index uses a spike-dampened baseline
            instead of the raw sum. The baseline is the team&apos;s median monthly all-language view
            count over the twelve-month window, multiplied by twelve. It answers &quot;what would this
            year have summed to at a typical month&apos;s pace,&quot; rather than letting one news
            cycle carry the whole total.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Spike ratio</h2>
          <p>
            The spike ratio is a team&apos;s busiest month divided by its median month, over the
            displayed twelve-month window. A ratio at or above 2.5 is marked with a small lightning
            icon on the index: it flags a year with one unusually loud month, not a team with weak
            underlying interest. A high spike ratio can also mean a genuine, sustained shift, such as
            a rename or relocation, rather than a single-month event. Read the marker as a prompt to
            look closer, not as a verdict.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">In-flux teams: the 0.5x weight</h2>
          <p>
            A small number of teams changed name, city or league status recently enough that their
            Wikipedia history spans more than one identity: a new franchise, a relocation, or a
            rename. Those teams draw look-up curiosity on top of ordinary fan interest, readers
            checking &quot;wait, who are the Utah Mammoth&quot; or searching out a freshly relocated
            club, and that curiosity inflates raw pageviews in a way that is not really attention to
            the team as a going concern. To correct for it, an in-flux team&apos;s contribution to
            attention is weighted at 0.5x rather than counted in full. Those teams are marked on the
            index with a small dot and a tooltip naming the change and the weighting. Read the marker
            as a flag on that team&apos;s number, not as a claim that the underlying interest is fake,
            only that part of it is name-change curiosity rather than steady-state fandom.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Attention score, and the global scale</h2>
          <p>
            The within-group score is the baseline, scaled to the top team in its own group: the
            group leader scores 100.0, and every other team in that group scores its baseline as a
            percentage of the leader&apos;s, to one decimal place. That score only compares teams
            within the same group.
          </p>
          <p>
            The &quot;All&quot; view on the index instead ranks every team, across every sport, on a
            single global score: each team&apos;s attention as a percentage of the single
            most-watched team across every sport in the index, on a plain linear scale. The team with
            the most attention anywhere scores 100.0; a team at half its attention scores 50.0. That
            is a literal ratio, the same way the within-group score is, just measured against one
            leader across the whole index instead of one leader per group. Most teams score low on
            this scale, because most teams draw far less attention than the single biggest team in
            the index; that is the honest picture of how concentrated global sports attention is, not
            a flaw in the scale.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Valuation and the attention-to-value line</h2>
          <p>
            Where a team has a published franchise valuation in this site&apos;s valuations dataset,
            it is joined to that figure. Within each group with enough valued teams, a log-log
            ordinary least squares line is fit between the baseline and the valuation. The fitted
            line gives a predicted valuation for each team from its attention alone, and the
            &quot;vs attention&quot; column on the index is the percentage gap between the team&apos;s
            actual valuation and that prediction: positive means the team is valued above what its
            attention alone would predict, negative means below.
          </p>
          <p>
            That comparison is only shown where the group&apos;s fit is strong enough to trust, R
            squared at or above 0.4, and is recomputed on every data refresh, so which groups clear
            that line can change as more teams gain a valuation or a fit is re-run. As of this
            page&apos;s last build:
          </p>
          <p className="mt-3">
            <strong className="text-[var(--text)]">Residual shown:</strong>{" "}
            {eligible.length ? eligible.join(", ") : "none yet"}.
          </p>
          <p>
            <strong className="text-[var(--text)]">Residual shown as n/a</strong> (valued teams exist,
            but the group&apos;s fit is below the 0.4 line):{" "}
            {notEligible.length ? notEligible.join(", ") : "none"}.
          </p>
          <p className="mt-3">
            Attention has historically explained franchise value well within European football, an
            almost mechanical relationship, likely because European club value is itself driven
            heavily by global fan reach and media rights, which pageviews also track. It explains
            value only moderately for the big US leagues, and very little for leagues whose
            valuations are set by factors such as media-rights deals, ownership scarcity and arena
            economics that do not show up in Wikipedia traffic.
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
              <strong className="text-[var(--text)]">Attention measures curiosity as well as
              fandom.</strong> A team in the news, for a trade, a scandal, a coaching change, draws
              Wikipedia look-ups from people who are not really its fans and would not call themselves
              one. That team can rank above its actual fanbase size on this index simply because more
              people were curious about it that month. The in-flux weighting above corrects for the
              most visible version of this (a rename or relocation), but ordinary news-driven curiosity
              is not otherwise separated out.
            </li>
            <li>
              <strong className="text-[var(--text)]">News and event spikes.</strong> Wikipedia
              traffic reacts sharply to single events: trades, coaching changes, scandals, deep
              playoff runs. Even the spike-dampened baseline can still overweight a team that had one
              unusually loud stretch relative to a team with steadier, lower-amplitude attention.
            </li>
            <li>
              <strong className="text-[var(--text)]">Relocations and renames.</strong> The Athletics
              and Utah Mammoth are tracked under their current article titles; both, and every other
              in-flux team, carry the marker and the 0.5x weighting described above.
            </li>
            <li>
              <strong className="text-[var(--text)]">Language skew.</strong> US teams skew heavily
              toward English-language traffic, while European football clubs are followed across
              dozens of non-English Wikipedias. That difference in language breadth, not just
              difference in popularity, is a large part of why European clubs lead the index on raw
              and baseline attention.
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
            <li>
              <strong className="text-[var(--text)]">EuroLeague has no per-club page yet.</strong> The
              site&apos;s EuroLeague coverage links each club to its metro page, not a dedicated team
              page, so EuroLeague rows on the index do not link out the way other groups do. That is
              a gap in the site&apos;s team pages, not a resolver error.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Citing this dataset</h2>
          <p>
            Suggested citation: <em>Citizen of Nowhere, Fan Attention Index {data.version} (2026),
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
