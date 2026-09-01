import type { Metadata } from "next";
import Link from "next/link";
import {
  getConstitutions, getConstitutionDocuments, oldestInForce, byAmendmentRate, completedLifespans,
  mean, instrumentsPerDecade, type ConstitutionCountry,
} from "@/lib/constitutions";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { StatTile } from "@/app/elections/HubShared";
import SortableTable from "@/app/elections/SortableTable";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";
import { TableScroll } from "@/app/_shared/TableScroll";

const PATH = "/constitutions";
const TITLE = "The World's Constitutions";
const DESC =
  "When every country's constitution was written, how often it is amended, and how long documents like it have lasted. The United States has amended its founding text 16 times in 230 years. Brazil has amended its 1988 constitution 33 times in 37.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

/** The year this constitution last changed. More useful than a coverage date:
 *  the source runs to 2025 for everyone, so what varies is when each country
 *  last did something. */
function LastChanged({ c }: { c: ConstitutionCountry }) {
  const quiet = c.asOf - c.lastEvent;
  return (
    <span className="tabular-nums text-[var(--text-muted)]"
          title={quiet >= 1 ? `No recorded constitutional event for ${quiet} years.` : undefined}>
      {c.lastEvent}
    </span>
  );
}

export default function ConstitutionsPage() {
  const d = getConstitutions();
  const oldest = oldestInForce(d);
  const rates = byAmendmentRate(d);
  const lives = completedLifespans(d);
  const unc = getConstitutionDocuments();
  const mostChurn = [...d.countries].sort((a, b) => b.systemsSince1789 - a.systemsSince1789);
  // Computed, not written down: a hardcoded count here was wrong on the first
  // pass (fifteen, from eyeballing a table; the real answer is seven).
  const e = d.endurance;
  const preWW1 = oldest.filter((c) => (c.adopted as number) < 1914).length;
  const preWW2 = oldest.filter((c) => (c.adopted as number) < 1945).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)]">{TITLE}</h1>
      <p className="mt-3 text-[var(--text-muted)] leading-relaxed">
        A constitution is the one document a country writes about itself on purpose. Most of them
        do not last. Since 1789 the world has produced {d.systems.length} constitutional systems and
        replaced {lives.length} of them; half are gone within {e.medianYears} years. The handful
        that endure are the exception, and this is the record of both.
      </p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Countries" value={String(d.coverage.liveCountries)} hint="with a constitutional record" />
        <StatTile label="Systems since 1789" value={String(d.systems.length)} hint={`${lives.length} already replaced`} />
        <StatTile label="Median life" value={`${e.medianYears} yrs`} hint={`${lives.length} replaced, mean ${mean(lives).toFixed(1)}`} />
        <StatTile label="Oldest in force" value={String(oldest[0]?.adopted ?? "—")} hint={oldest[0]?.name} />
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-[var(--text)]">The oldest still standing</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Adoption year of the constitution currently in force. Just {preWW1} countries are governed
          by a document written before the First World War, and {preWW2} by one written before the
          end of the Second.
        </p>
        {/* CappedList renders its overflow inside a <details><div>, which a
            <tbody> cannot legally contain: rows 13+ get hoisted out of the
            table's layout and the columns visibly jump. So the house pattern
            applies here as everywhere else - a real table on desktop, capped
            cards on phones. */}
        <TableScroll className="mt-4 hidden sm:block rounded-xl border"
                     style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <table className="w-full text-sm" data-sticky-col={2}>
            <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2 text-right">Adopted</th>
                <th className="px-3 py-2 text-right">Age</th>
                <th className="px-3 py-2 text-right">Amendments / decade</th>
                <th className="px-3 py-2 text-right">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {oldest.slice(0, 40).map((c, i) => (
                <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{c.adopted}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.ageYears}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n2(c.amendPerDecade)}</td>
                  <td className="px-3 py-2.5 text-right"><LastChanged c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
          <CappedList
            initial={12}
            noun="countries"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={oldest.slice(0, 40).map((c, i) => (
              <div key={c.slug} className="rounded-lg border p-3"
                   style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-medium text-[var(--text)]">
                    <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                    <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                  </span>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{c.adopted}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                  <span>{c.ageYears} years old</span>
                  <span>{n2(c.amendPerDecade)} amendments / decade</span>
                  <span>covered to <LastChanged c={c} /></span>
                </div>
              </div>
            ))}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-[var(--text)]">How often a constitution changes</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Amendment events per decade in force, for every constitution at least twenty years old.
          This is the closest thing to an honest difficulty measure, because it records what
          actually happened rather than what the amendment clause says. Sort any column.
        </p>
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          A note on counting: the source records amendment <em>events</em>, not amended articles.
          The United States shows 16 events for 27 amendments, because the ten articles of the Bill
          of Rights were ratified as one act.
        </p>
        <div className="mt-4">
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
            cols={[
              { key: "country", label: "Country" },
              { key: "rate", label: "Per decade" },
              { key: "events", label: "Events" },
              { key: "adopted", label: "Adopted" },
              { key: "age", label: "Age" },
              { key: "lastEvent", label: "Last changed" },
            ]}
            rows={rates.map((c) => ({
              key: c.slug,
              sort: {
                country: c.name,
                rate: c.amendPerDecade,
                events: c.amendEvents,
                adopted: c.adopted,
                age: c.ageYears,
                lastEvent: c.lastEvent,
              },
              cells: (
                <>
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">{n2(c.amendPerDecade)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.amendEvents}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.adopted}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.ageYears}</td>
                  <td className="px-3 py-2.5"><LastChanged c={c} /></td>
                </>
              ),
            }))}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-[var(--text)]">Countries that keep starting over</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Constitutional systems adopted since 1789. Amending a constitution and replacing one are
          different acts, and the countries at the top of this list have done the second far more
          often than the first.
        </p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {mostChurn.slice(0, 10).map((c) => (
            <li key={c.slug} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <Link href={`/countries/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link>
              <span className="tabular-nums text-sm text-[var(--text-muted)] shrink-0">
                <span className="font-semibold text-[var(--text)]">{c.systemsSince1789}</span> constitutions
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-[var(--text)]">Three ways to have a constitution</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Most countries keep their constitution in one document that says how it may be changed.
          Two do not, and they are not edge cases to be tidied away: the United Kingdom and New
          Zealand are governed by a body of statute, court decision and convention in which any
          part can be altered by an ordinary Act of Parliament. A third group, including Israel and
          Saudi Arabia, works from a set of basic laws rather than a single text.
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The comparative dataset records no amendment procedure for the uncodified pair, which
          would leave them off every board on this page. Instead they get the series that actually
          describes them: the statutes that changed the constitution.
        </p>

        {Object.entries(unc.uncodified).map(([slug, u]) => {
          const rate = instrumentsPerDecade(u);
          return (
            <div key={slug} className="mt-6 rounded-xl border p-4"
                 style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-lg font-bold text-[var(--text)]">
                  <Link href={`/countries/${slug}`} className="hover:text-[var(--accent)]">
                    {d.countries.find((c) => c.slug === slug)?.name ?? slug}
                  </Link>
                </h3>
                <p className="text-xs text-[var(--text-muted)] tabular-nums">
                  {u.instruments.length} instruments
                  {rate != null ? <> · {rate} per decade since 1900</> : null}
                </p>
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">{u.summary}</p>
              <Disclosure title="The instruments" meta={`${u.instruments.length} since ${u.instruments[0].year}`} desktopOpen={false} summaryClassName="px-0">
                <ol className="mt-3 space-y-2">
                  {u.instruments.map((i) => (
                    <li key={`${i.year}-${i.name}`} className="flex gap-3 text-sm">
                      <span className="tabular-nums font-semibold text-[var(--text)] w-12 shrink-0">{i.year}</span>
                      <span className="min-w-0">
                        <span className="font-medium text-[var(--text)]">{i.name}</span>
                        {i.repealed ? (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                            repealed {i.repealed}
                          </span>
                        ) : null}
                        <span className="block text-[var(--text-muted)]">{i.what}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Disclosure>
            </div>
          );
        })}

        <p className="mt-4 text-xs text-[var(--text-dim)]">
          Counted as constitutional: statutes that condition the relationship between citizen and
          state in a general way or alter fundamental rights, which is the sense the courts use,
          plus the landmark extensions of the franchise. A count of these is not the same measure as
          an amendment rate, and the two are not compared above.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-[var(--text)]">How long a constitution lasts</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Measured across all {d.systems.length} systems since 1789, treating a constitution as
          having died only when a later one replaced it. Where a country ceased to exist, as Poland
          did in 1795, its constitution did not fail and is not counted as a death.
        </p>

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Survival</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Half of all constitutions are gone within {e.medianYears} years.
            </p>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {Object.entries(e.survival).map(([yrs, p]) => (
                <li key={yrs} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[var(--text-muted)]">{yrs} yrs</span>
                  <span className="h-2 rounded-full bg-[var(--accent)] shrink-0" style={{ width: `${p * 60}%` }} />
                  <span className="text-[var(--text)]">{Math.round(p * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Age protects</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Chance of lasting another twenty years, given how long it has already stood. Unlike a
              machine, a constitution grows safer with age.
            </p>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {Object.entries(e.another20GivenAge).map(([age, p]) => (
                <li key={age} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[var(--text-muted)]">age {age}</span>
                  <span className="h-2 rounded-full bg-[var(--accent)] shrink-0" style={{ width: `${p * 60}%` }} />
                  <span className="text-[var(--text)]">{Math.round(p * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h3 className="mt-6 font-bold text-[var(--text)]">Constitutions have become much harder to kill</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Written</th>
                <th className="px-3 py-2 text-right">Constitutions</th>
                <th className="px-3 py-2 text-right">Median life</th>
                <th className="px-3 py-2 text-right">Reached 20 years</th>
              </tr>
            </thead>
            <tbody>
              {e.eras.map((x) => (
                <tr key={x.label} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2.5 font-medium">{x.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{x.n}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {x.median == null ? <span className="text-[var(--text-muted)]">not yet reached</span> : `${x.median} yrs`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(x.p20 * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          More than half the constitutions written since 1990 are still standing, so their median
          life cannot be calculated yet. One written today is about twice as likely to see its
          twentieth birthday as one written in the nineteenth century.
        </p>

        <h3 className="mt-6 font-bold text-[var(--text)]">The ones that bend, last</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Among constitutions that survived their first ten years, those amended during that decade
          went on to last a median of {e.flexibility.amendedEarly.medianFurther} more years, against{" "}
          {e.flexibility.notAmendedEarly.medianFurther} for those left untouched
          ({e.flexibility.amendedEarly.n} against {e.flexibility.notAmendedEarly.n} cases). A
          constitution that cannot be adjusted is not protected by its rigidity. It is endangered
          by it.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 rounded-xl border p-4 text-sm"
               style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <h2 className="font-bold text-[var(--text)]">What this page can and cannot tell you</h2>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          The source records every country in every year up to {d.coverage.panelEnd}. From{" "}
          {d.coverage.panelEnd + 1} it records constitutional events only, so a country with
          nothing listed since then has had no recorded change, rather than no data.{" "}
          {d.coverage.countriesWithAnEventSince2020} of the {d.coverage.liveCountries} countries
          here have done something constitutional since 2020, including thirteen that replaced
          their constitution outright. What the page cannot tell you is whether an event has gone
          unrecorded, which is why each row shows the year it last changed rather than claiming a
          state of affairs today.
        </p>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          There is also no forecast of how long any particular constitution will last. One was
          built and tested against the record: asked in 1999 how many of the world&apos;s
          constitutions would still stand in 2019, it said 92 and the answer was 135. A model that
          calibrates on the nineteenth century and expects collapse in the present is not a
          forecast, so it is not on this page.
        </p>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          There is deliberately no rigidity ranking here. A constitution can set out an elaborate
          amendment procedure and still be rewritten at will, and several are. Counting what was
          actually amended says more than scoring what the clause promises.
        </p>
        <p className="mt-3 text-xs text-[var(--text-dim)]">
          Data: {d.citation.chronology} {d.citation.characteristics}{" "}
          <a href={d.citation.url} className="underline hover:text-[var(--accent)]" rel="noopener noreferrer" target="_blank">
            comparativeconstitutionsproject.org
          </a>. Built {d.built}.
        </p>
      </section>

      <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/constitutions/leaders" className="text-[var(--accent)] hover:underline">Who outlasts whom</Link>
        <Link href="/elections" className="text-[var(--accent)] hover:underline">Elections</Link>
        <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
        <Link href="/us-political-leadership" className="text-[var(--accent)] hover:underline">US Political Leadership</Link>
        <Link href="/countries" className="text-[var(--accent)] hover:underline">Countries</Link>
      </nav>
    </main>
  );
}
