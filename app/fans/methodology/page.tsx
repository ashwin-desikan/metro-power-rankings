import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { getMethodSummary } from "@/lib/fanIndex";
import { FansCrumbs, FansNav, TabHeader } from "../_shared/ui";

export const dynamicParams = false;

const PAGE_PATH = "/fans/methodology";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Citizen of Nowhere Fan Attention Index: Methodology";
const PAGE_DESCRIPTION =
  "How the Fan Attention Index is built: the Wikipedia and Google Trends blend, the entity check, the college inclusion rules, the in-flux weighting, the global cross-sport scale, and what the index cannot tell you.";

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

// Reads ONLY data/fans/method-summary.json (getMethodSummary()), a small
// committed, public-safe, per-group/per-league aggregate file -- never the
// gitignored data/fans/fan-attention.json (absent in production) and never
// Supabase. getMethodSummary() throws a clear error at build/request time
// if that file is missing, rather than letting this page render its
// valuation section empty, so a broken pipeline fails loudly here instead
// of silently.
export default function FansMethodologyPage() {
  const summary = getMethodSummary();
  const groupsWithValuation = summary.groups.filter((g) => g.value_fit_n > 0);
  const eligible = groupsWithValuation.filter((g) => g.value_vs_attention_shown).map((g) => g.group);
  const notEligible = groupsWithValuation.filter((g) => !g.value_vs_attention_shown).map((g) => g.group);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <FansCrumbs tab="Methodology" />
      <TabHeader
        emoji="🎟️"
        title={PAGE_TITLE}
        sub="How the index is built, what it measures, and what it does not."
      />
      <FansNav active="methodology" />

      <div className="prose-fans text-[15px] text-[var(--text-muted)] space-y-6">
        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">What this measures</h2>
          <p>
            The Fan Attention Index is a read of how much public attention a sports team draws
            online, blending Wikipedia readership with Google Trends search interest. It is not a
            fan count and it is not a survey. Its base layer is a direct tally of page requests to a
            team&apos;s Wikipedia article, from humans, not bots, across as many as 143 language
            editions for one club; on top of that, most groups add a normalised read of how often
            people search for the team.
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
            which counts only human traffic and excludes bots and spiders, summed across every
            language edition listed on the team&apos;s Wikidata item. Search interest comes from
            Google Trends, normalised within each group so it can be combined with the Wikipedia
            signal. A Reddit subscriber count is part of the design (a third input, alongside Wikipedia
            and Trends) but has no live data source wired up yet; every team currently carries a null
            for it, and the blend below reweights around its absence rather than treating it as a zero.
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
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">The blend: Wikipedia, Trends, and Reddit</h2>
          <p>
            Within a group, the design target is Wikipedia at 0.4, Google Trends at 0.3 and Reddit at
            0.3. Reddit has no live data yet, so those two-thirds of that weight are not simply
            dropped: the two working inputs are reweighted proportionally to fill the gap, which comes
            out to roughly four-sevenths Wikipedia and three-sevenths Trends in practice. That is why
            the index currently marks every team&apos;s signal as either &quot;wiki only&quot; (Trends
            did not clear the adoption gate below, so Wikipedia stands alone) or &quot;blend&quot;
            (Wikipedia and Trends combined); there is no &quot;full blend&quot; state yet, since
            Reddit is not live.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Groups scored on Wikipedia alone</h2>
          <p>
            Google Trends measures search volume for a query string, and a team name that collides
            with an unrelated common word or place name pulls in search volume that has nothing to do
            with the team. Como, the Serie A club, shares its name with Lake Como; a search-volume
            signal for &quot;Como&quot; is mostly tourism, not football interest. Rather than build a
            per-team exception list, the whole Football group is scored on Wikipedia alone, along with
            AFL, F1, NRL, college football and college basketball, where the same collision problem is
            common enough (school nicknames, city names, ordinary English words) that Trends would add
            noise rather than signal. Every team in those groups is a &quot;wiki only&quot; signal, by
            group policy, not because Trends was individually checked and rejected for that team.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">The adoption gate</h2>
          <p>
            Even in a group where Trends is used, an individual team&apos;s Trends read is only folded
            into its score once that signal clears a minimum adoption gate: too little search volume
            to be statistically meaningful is worse than no signal at all, since a thin, noisy series
            can swing a team&apos;s score around for reasons that have nothing to do with its actual
            attention. A team below the gate falls back to &quot;wiki only&quot; for that one team,
            even inside a group where most other teams blend successfully.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Spike ratio</h2>
          <p>
            The spike ratio is a team&apos;s busiest month divided by its median month, over the
            displayed twelve-month window, computed from the Wikipedia series. A ratio at or above 2.5
            is marked with a small lightning icon on the index: it flags a year with one unusually
            loud month, not a team with weak underlying interest. A high spike ratio can also mean a
            genuine, sustained shift, such as a rename or relocation, rather than a single-month event.
            Read the marker as a prompt to look closer, not as a verdict.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">In-flux teams: the 0.5x weight</h2>
          <p>
            A small number of teams changed name, city or league status recently enough that their
            Wikipedia history spans more than one identity: a new franchise, a relocation, or a
            rename. Those teams draw look-up curiosity on top of ordinary fan interest, readers
            checking &quot;wait, who are the Utah Mammoth&quot; or searching out a freshly relocated
            club, and that curiosity inflates raw attention in a way that is not really interest in
            the team as a going concern. To correct for it, an in-flux team&apos;s contribution to
            attention is weighted at 0.5x rather than counted in full. Those teams are marked on the
            index with a small dot and a tooltip naming the change and the weighting. Read the marker
            as a flag on that team&apos;s number, not as a claim that the underlying interest is fake,
            only that part of it is name-change curiosity rather than steady-state fandom.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">College inclusion rules</h2>
          <p>
            College football and college basketball do not have a fixed league roster the way a pro
            league does, so which programs belong on the index is set by an explicit rule rather than
            by editorial judgment team by team. Programs are marked with a small double-dagger and a
            tooltip naming the exact rule when they are on the index for a reason other than plain
            major-conference membership.
          </p>
          <p>
            <strong className="text-[var(--text)]">College football:</strong> every Power 4 program,
            Notre Dame, any program with a final AP Top 25 finish in the last 5 seasons, and Army and
            Navy by name (service-academy programs with a national following that the conference-only
            rule would otherwise exclude).
          </p>
          <p>
            <strong className="text-[var(--text)]">College basketball:</strong> every major-conference
            program, plus any program that reached the Final Four in the last 20 seasons or posted a
            final AP Top 25 finish in the last 5 seasons, on the view that a Final Four run or a
            ranked season is itself evidence of the national attention this index is trying to
            measure, even from a program outside the traditional power conferences.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Attention score, and the global scale</h2>
          <p>
            The within-group score is the blended (or, for a wiki-only group or team, Wikipedia-only)
            attention figure, scaled to the top team in its own group: the group leader scores 100.0,
            and every other team in that group scores its attention as a percentage of the
            leader&apos;s, to one decimal place. That score only compares teams within the same group.
          </p>
          <p>
            The &quot;Cross-sport score&quot; shown in the All view, and in each category tab when no
            group chip is selected, instead ranks every team on a single global score. That score is
            not the within-group attention figure directly; it is that figure scaled by a per-league
            factor before teams from different sports are put on the same axis. The full method for
            that scaling, and why it exists, is the next section. The team with the highest cross-sport
            score anywhere scores 100.0; a team at half that scores 50.0. Most teams score low on this
            scale, because most teams draw far less scaled attention than the single biggest team in
            the index; that is the honest picture of how concentrated cross-sport attention is, not a
            flaw in the scale. The within-group score above, and the within-league or within-group
            order it produces, is completely unaffected by any of this: the cross-sport scale only
            changes how teams from different sports compare to each other, never the ranking of teams
            against others in their own league or group.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Comparing across sports</h2>
          <p>
            Raw Wikipedia attention overweights football relative to almost everything else, for
            reasons that have little to do with fandom. A football club is covered by dozens of
            language editions of Wikipedia, one per country that follows the sport seriously, while a
            team in a more regionally-concentrated sport might have five or six. Wikipedia is also
            football&apos;s de facto reference site in a way it is not for US sports, where fans reach
            first for ESPN, a league&apos;s own site or a stats site rather than an encyclopedia
            article. Compared purely on raw pageviews, a mid-table European club can out-rank a
            marquee NFL franchise, not because more people care about the club, but because Wikipedia
            captures a larger share of the club&apos;s total attention than it captures of the
            franchise&apos;s.
          </p>
          <p>
            The fix is a per-league scaling factor, k<sub>L</sub>, applied before any cross-sport
            comparison. For each league L (each Football league counted separately; every other sport
            grouped by its own group), k<sub>L</sub> = the square root of that league&apos;s total
            annual revenue divided by its total Wikipedia attention. A team&apos;s cross-sport score is
            its within-league attention share multiplied by k<sub>L</sub>, so leagues whose fans
            generate more real-world revenue per unit of Wikipedia attention are scaled up relative to
            leagues (like top-flight European football) whose Wikipedia footprint already runs ahead of
            their revenue. Revenue figures come from Deloitte&apos;s Football Money League (Europe&apos;s
            top 5 leagues plus the WSL), Forbes and Sportico franchise-value reporting, and each
            league or federation&apos;s own published or reputable-aggregator revenue figures elsewhere.
            Every team carries an <code>anchor_source</code> naming exactly which figure was used and an
            <code>anchor_confidence</code> of high, medium or low, so a reader can see how solid the
            revenue side of that team&apos;s scaling is.
          </p>
          <p>
            This scaling only ever touches the cross-sport comparison. It has no effect on the
            within-league or within-group order: a team&apos;s rank among its own league or group
            rivals is set entirely by its share of that league&apos;s or group&apos;s Wikipedia (and,
            where used, Trends) attention, exactly as described above, before k<sub>L</sub> is ever
            applied.
          </p>
          <p>
            The Football group (every league in it, including MLS and Liga MX) is Wikipedia-only in
            this version, with Trends left out entirely: club football team names collide constantly
            with unrelated high-volume searches, for example MLS&apos;s Chicago Fire against the
            unrelated television series of the same name, so no Football league&apos;s Trends read
            can be trusted and none is used.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Valuation, and &quot;Valued vs attention&quot;</h2>
          <p>
            Where a team has a franchise valuation in this site&apos;s valuations dataset, it is
            joined to that figure. Every value is converted to USD at the exchange rate on the
            valuation&apos;s own as-of date, not today&apos;s rate, so a 2023 valuation in another
            currency is not silently inflated or deflated by currency movement since then.
          </p>
          <p>
            Within each league with enough valued teams, a log-log ordinary least squares line is
            fit between the baseline and the valuation. The fitted line gives a predicted valuation
            for each team from its attention alone. <strong className="text-[var(--text)]">Valued vs
            attention</strong> is that team&apos;s actual valuation divided by the line&apos;s
            prediction, shown as a multiplier: <code>&times;2.0</code> means the team is valued at
            twice what its attention within its league would suggest; <code>&times;0.5</code> means
            half. It replaces an earlier percentage-gap version of the same comparison (still stored
            as <code>residual_pct</code> in the underlying data).
          </p>
          <p>
            The multiplier is only shown where the league&apos;s fit is strong enough to trust, R
            squared at or above 0.4; everywhere else the index shows a dash. That threshold is
            recomputed on every data refresh, so which leagues clear it can change as more teams
            gain a valuation or a fit is re-run. As of this page&apos;s last build:
          </p>
          <p className="mt-3">
            <strong className="text-[var(--text)]">Shown:</strong>{" "}
            {eligible.length ? eligible.join(", ") : "none yet"}.
          </p>
          <p>
            <strong className="text-[var(--text)]">Shown as a dash</strong> (valued teams exist,
            but the league&apos;s fit is below the 0.4 line):{" "}
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
          <p className="mt-3">
            A small badge next to a valuation marks how it was derived: <strong
            className="text-[var(--text)]">deal</strong> means the figure is implied by a recent
            stake sale rather than a standalone appraisal, <strong
            className="text-[var(--text)]">athletic dept</strong> means the figure covers a
            university&apos;s whole athletic department, not the one team shown, and <strong
            className="text-[var(--text)]"><em>est</em></strong> (shown muted and italic) means the
            figure is an estimate, not a reported valuation or a disclosed deal. Estimated figures
            are excluded from the attention-to-value fit above (they would let the index validate
            itself against its own guesses), but Valued vs attention is still shown for an
            estimated team, multiplier and <em>est</em> badge together, so a reader can weigh it
            appropriately rather than see a gap in the column. A valuation with none of these three
            badges is a publisher&apos;s own franchise appraisal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Limits</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-[var(--text)]">Revenue scaling reflects monetisation as well as
              fandom.</strong> A league&apos;s revenue is shaped by media-rights deals, ticket prices,
              sponsorship markets and other business factors that are not the same thing as how many
              people care about it, so the k<sub>L</sub> cross-sport scale carries some of that
              business-side distortion along with the fandom signal it is meant to correct for.
            </li>
            <li>
              <strong className="text-[var(--text)]">Some revenue anchors are low-confidence
              estimates.</strong> Every team&apos;s <code>anchor_confidence</code> says how solid its
              league&apos;s revenue figure is, and several leagues currently sit at medium or low:
              Argentina&apos;s Liga Profesional, Liga MX, the Primeira Liga, Eredivisie and Süper Lig
              (whose figures are from the 2021-22 season), NPB, the CFL, the Handball-Bundesliga,
              SuperLega, the college groups, and the IPL (media-rights revenue only, not the
              franchises&apos; full commercial revenue). A cross-sport comparison involving any of
              these leagues should be read with that uncertainty in mind.
            </li>
            <li>
              <strong className="text-[var(--text)]">Attention is not fandom.</strong> Wikipedia and
              search interest are reference and lookup signals, not ticket-buying or
              merchandise-buying signals. They capture casual and news-driven interest well and
              under-represent passionate fan bases that are less likely to look a team up online,
              particularly younger, social-media-native audiences.
            </li>
            <li>
              <strong className="text-[var(--text)]">Attention measures curiosity as well as
              fandom.</strong> A team in the news, for a trade, a scandal, a coaching change, draws
              look-ups from people who are not really its fans and would not call themselves one.
              That team can rank above its actual fanbase size on this index simply because more
              people were curious about it that month. The in-flux weighting above corrects for the
              most visible version of this (a rename or relocation), but ordinary news-driven curiosity
              is not otherwise separated out.
            </li>
            <li>
              <strong className="text-[var(--text)]">Agreement with a search-based benchmark is not
              independent proof.</strong> This index was checked against an outside popularity
              benchmark during development, and where the two agree that is treated as supporting
              evidence for the method, not as proof of it: that benchmark is itself built substantially
              from search and web-attention signals, so a strong correlation partly reflects shared
              inputs and blind spots rather than two independent measurements landing on the same
              answer.
            </li>
            <li>
              <strong className="text-[var(--text)]">News and event spikes.</strong> Wikipedia and
              search traffic both react sharply to single events: trades, coaching changes, scandals,
              deep playoff runs. Even the spike-dampened baseline can still overweight a team that had
              one unusually loud stretch relative to a team with steadier, lower-amplitude attention.
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
              &quot;Valued vs attention&quot; multiplier should be read with that in mind.
            </li>
            <li>
              <strong className="text-[var(--text)]">EuroLeague, Top 14, Handball-Bundesliga and
              SuperLega have no per-club page yet.</strong> The site&apos;s coverage of these leagues
              links each club to its metro page, not a dedicated team page, so rows in these four
              groups do not link out the way other groups do. That is a gap in the site&apos;s team
              pages, not a resolver error.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Updates and history</h2>
          <p>
            The index refreshes monthly, on the 3rd. Each month&apos;s snapshot is kept, starting from
            January 2024, so a team&apos;s attention, ranking and cross-sport score can be compared
            month over month rather than only read as a single current figure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">Citing this dataset</h2>
          <p>
            Suggested citation: <em>Citizen of Nowhere Fan Attention Index {summary.version} (2026),
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
