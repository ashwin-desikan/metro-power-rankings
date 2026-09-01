import type { Metadata } from "next";
import Link from "next/link";
import { getTenures, ranked, unchanged, OFFICE_LABEL } from "@/lib/constitutionTenures";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { StatTile } from "@/app/elections/HubShared";
import SortableTable from "@/app/elections/SortableTable";
import { CappedList } from "@/app/_shared/Disclosure";

const PATH = "/constitutions/leaders";
const TITLE = "Who Outlasts Whom";
const DESC =
  "Documents outlive people, or people outlive documents. Italy has changed prime minister 46 times under one constitution. Cameroon has changed head of state once in 53 years. King Bhumibol of Thailand reigned through eight constitutions.";

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

/** A constitution younger than this makes a rate out of noise. */
const MIN_YEARS = 20;

export default function ConstitutionLeadersPage() {
  const d = getTenures();
  const all = ranked(d);
  const eligible = all.filter((c) => c.years >= MIN_YEARS && c.yearsPerTransition != null);
  const byChurn = [...eligible].sort(
    (a, b) => (a.yearsPerTransition as number) - (b.yearsPerTransition as number),
  );
  const still = unchanged(d);
  const top = d.spanners[0];
  const rotating = d.countries.filter((c) => c.excluded.rotating);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/constitutions" className="hover:underline">Constitutions</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)]">{TITLE}</h1>
      <p className="mt-3 text-[var(--text-muted)] leading-relaxed max-w-3xl">
        A constitution and the people governing under it are in a quiet contest. Sometimes the
        document wins and outlives dozens of them. Sometimes one person outlives several
        documents. This page counts both, for {d.countries.length} countries, using nothing but
        dates.
      </p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Constitutions measured" value={String(d.countries.length)} hint="every country with a dated record" />
        <StatTile label="Most executives" value={String(all[0]?.transitions ?? 0)} hint={`${all[0]?.name} since ${all[0]?.adopted}`} />
        <StatTile label="Most constitutions outlasted" value={String(top?.constitutionsOutlasted ?? 0)} hint={top ? `${top.name}, ${top.country}` : undefined} />
        <StatTile label="Never changed hands" value={String(still.length)} hint="constitutions with no transition yet" />
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-[var(--text)]">A low number is not stability</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl leading-relaxed">
          Read the two ends of this board together or it will mislead you. The constitutions that
          have seen the most changes of executive belong to Italy and Japan, where governments fall
          and are replaced without the document being touched. The ones that have seen the fewest
          belong to countries where a single person did not leave. Frequent change of leader and a
          durable constitution are the same picture, not opposite ones.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-[var(--text)]">Documents that outlasted their leaders</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Executives whose term began while the current constitution stood. Both offices are shown,
          because the executive is the president in the United States and the prime minister in
          Italy, and one rule cannot cover both. Sort any column.
        </p>
        <div className="mt-4">
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
            cols={[
              { key: "country", label: "Country" },
              { key: "adopted", label: "Constitution" },
              { key: "transitions", label: "Executives" },
              { key: "per", label: "Years each" },
              { key: "hos", label: "Heads of state" },
              { key: "hog", label: "Heads of gov." },
            ]}
            rows={all.map((c) => ({
              key: c.slug,
              sort: {
                country: c.name,
                adopted: c.adopted,
                transitions: c.transitions,
                per: c.yearsPerTransition,
                hos: c.headsOfState,
                hog: c.headsOfGovernment,
              },
              cells: (
                <>
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                    {c.approximateRows ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]" title="Some rows come from a coarse leaders file; treat this count as approximate.">
                        approx
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{c.adopted}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">{c.transitions}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {c.years >= MIN_YEARS && c.yearsPerTransition != null ? c.yearsPerTransition : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)]">{c.headsOfState}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)]">{c.headsOfGovernment}</td>
                </>
              ),
            }))}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          Years each is left blank for constitutions younger than {MIN_YEARS} years, where the ratio
          would be noise rather than a rate.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-[var(--text)]">Leaders who outlasted their constitutions</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A single unbroken tenure that saw a new constitution adopted beneath it, sometimes more
          than once. {d.spanners.length} people have done it since 1789.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <CappedList
            initial={10}
            noun="leaders"
            className="rounded-lg border border-[var(--border)]"
            bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
            items={d.spanners.slice(0, 40).map((s) => (
              <div key={`${s.slug}-${s.name}-${s.start}`} className="rounded-lg border p-3"
                   style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-[var(--text)] min-w-0">{s.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text)]">{s.constitutionsOutlasted}</span>{" "}
                    constitution{s.constitutionsOutlasted === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
                  <Link href={`/countries/${s.slug}`} className="hover:text-[var(--accent)]">{s.country}</Link>
                  {" · "}{s.role}{" · "}{s.start} to {s.end ?? "present"}
                  {" · "}adopted {s.adoptedDuring.join(", ")}
                </p>
              </div>
            ))}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {still.length ? (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-[var(--text)]">Constitutions that have never changed hands</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            No executive has taken office under these documents since they were written. The person
            in place at adoption is still the person in place.
          </p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2">
            {still.map((c) => (
              <li key={c.slug} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <Link href={`/countries/${c.slug}`} className="font-medium hover:text-[var(--accent)]">{c.name}</Link>
                <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
                  since {c.adopted}
                  {c.inOfficeAtAdoption[0] ? ` · ${c.inOfficeAtAdoption[0].name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 rounded-xl border p-4 text-sm"
               style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <h2 className="font-bold text-[var(--text)]">What is counted, and what is not</h2>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          Rotating and ceremonial offices are excluded. Switzerland&apos;s presidency changes hands
          every January by rotation, so counting it would make the calmest polity in Europe the most
          volatile country on this page; its {rotating.find((c) => c.slug === "switzerland")?.excluded.rotating ?? 0}{" "}
          rotations sit outside the count, as does Malaysia&apos;s five-yearly monarchy. Acting and
          caretaker holders are excluded as well, and so are party offices, because deciding who
          really governed is not this board&apos;s job.
        </p>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          Someone already in office when a constitution was adopted is not counted as a transition.
          They inherited the document rather than arriving under it, and they are listed instead
          beside the constitutions that have never changed hands.
        </p>
        <p className="mt-3 text-xs text-[var(--text-dim)]">
          Constitutional dates from the Comparative Constitutions Project, officeholders from this
          site&apos;s own leaders records, counted as of {d.asOf}. Built {d.built}.{" "}
          <Link href="/constitutions" className="underline hover:text-[var(--accent)]">The constitutions themselves →</Link>
        </p>
      </section>

      <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/constitutions" className="text-[var(--accent)] hover:underline">The World&apos;s Constitutions</Link>
        <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
        <Link href="/elections" className="text-[var(--accent)] hover:underline">Elections</Link>
      </nav>
    </main>
  );
}
