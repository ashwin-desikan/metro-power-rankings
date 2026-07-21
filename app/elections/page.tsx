import type { Metadata } from "next";
import Link from "next/link";
import { getUkElections } from "@/lib/ukElections";
import { getCaElections } from "@/lib/caElections";
import { getEuElections } from "@/lib/euElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/elections";
const TITLE = "Elections";
const DESC =
  "Election history hubs: every general election, the parties, the leaders, the turnout and the results — for novices who want the story and experts who want the numbers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ElectionsPage() {
  const uk = getUkElections();
  const ukFirst = uk.elections[0];
  const ukLast = uk.elections[uk.elections.length - 1];
  const ca = getCaElections();
  const caLast = ca.elections[ca.elections.length - 1];
  const eu = getEuElections();
  const euLast = eu.elections[eu.elections.length - 1];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/elections/uk"
          className="block rounded-xl border p-5 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">United Kingdom</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">UK General Elections →</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            All {uk.elections.length} general elections from {ukFirst.year} to {ukLast.year}: every result, every
            Prime Minister made and unmade, eight eras of electoral history, plus the referendums, devolved
            parliaments and mayoralties around them.
          </p>
        </Link>

        <Link
          href="/elections/us"
          className="block rounded-xl border p-5 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">United States</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">US Presidential Elections →</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            All 60 presidential elections from 1788 to 2024: every ticket, the popular and electoral votes,
            state-by-state results, turnout back to Washington, the Congress each contest seated, and the
            story of ten eras — from unanimous elections to the polarized present.
          </p>
        </Link>

        <Link
          href="/elections/ca"
          className="block rounded-xl border p-5 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Canada</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">Canadian Federal Elections →</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            All {ca.elections.length} federal elections from Confederation in 1867 to {caLast.year}: every
            Parliament from Macdonald to Carney, the minority-government specialty, the 1993 collapse, and
            eight eras of the world&apos;s second-largest Westminster democracy.
          </p>
        </Link>

        <Link
          href="/elections/eu"
          className="block rounded-xl border p-5 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">European Union</p>
          <p className="text-xl font-bold text-[var(--text)] mt-1">European Parliament Elections →</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            All {eu.elections.length} elections to the world&apos;s only directly elected transnational
            parliament, 1979 to {euLast.year}: the political groups, the presidents they made, turnout&apos;s
            long slide and rebound, and a chamber that grew from 410 seats to {euLast.totalSeats}.
          </p>
        </Link>
      </div>

      <section className="mt-10 text-sm text-[var(--text-muted)]">
        <p>
          Related: <Link href="/uk-political-leadership" className="text-[var(--accent)] hover:underline">UK Political Leadership</Link>
          {" · "}
          <Link href="/us-political-leadership" className="text-[var(--accent)] hover:underline">US Political Leadership</Link>
          {" · "}
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
        </p>
      </section>
    </main>
  );
}
