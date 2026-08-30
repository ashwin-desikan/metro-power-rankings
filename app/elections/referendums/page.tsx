import type { Metadata } from "next";
import Link from "next/link";
import { getReferendums } from "@/lib/referendums";
import { ELECTION_HUBS } from "@/lib/electionHubsMeta";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BackButton } from "../HubShared";
import SortableTable from "../SortableTable";

const PATH = "/elections/referendums";
const TITLE = "Landmark Referendums";
const DESC =
  "The votes where the people decided directly: Brexit and the near-miss in Quebec, the plebiscite that ended Pinochet, the ballot that abolished the Italian monarchy, Ireland's double rejection in 2024, Italy's judicial reform thrown out in 2026 — a century of landmark referendums with results, turnout and what happened next.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(n >= 90 ? 1 : 2).replace(/\.?0+$/, "")}%`);

export default function ReferendumsPage() {
  const { meta, referendums } = getReferendums();
  const closest = referendums
    .filter((r) => r.resultPct != null && !r.caveat)
    .reduce((a, b) => ((a.resultPct ?? 100) <= (b.resultPct ?? 100) ? a : b));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Referendums</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/elections" label="All election hubs" />
        <BackButton href="/elections/under-fire" label="Elections under fire" />
        <BackButton href="/elections/systems" label="Electoral systems" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {referendums.length} referendums · closest result: {closest.country} {closest.year}, {closest.result} {pct(closest.resultPct)} · every column sorts
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <SortableTable
          tableClassName="w-full text-sm"
          headClassName="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
          cols={[
            { key: "year", label: "Year" },
            { key: "country", label: "Country" },
            { key: "name", label: "Referendum" },
            { key: "result", label: "Result" },
            { key: "turnout", label: "Turnout" },
            { key: "outcome", label: "What happened", sortable: false },
          ]}
          rows={referendums.map((r) => ({
            key: r.id,
            sort: {
              year: r.year,
              country: r.country,
              name: r.name,
              result: r.resultPct,
              turnout: r.turnout,
            },
            cells: (
              <>
                <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)] whitespace-nowrap">{r.year}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={flagUrlByCode(r.flag)}
                      srcSet={flagSrcSetByCode(r.flag)}
                      alt=""
                      width={20}
                      height={15}
                      className="rounded-[2px] border shrink-0"
                      style={{ borderColor: "var(--border)" }}
                    />
                    {r.hub && ELECTION_HUBS[r.hub] ? (
                      <Link href={ELECTION_HUBS[r.hub].href} className="text-[var(--text)] hover:text-[var(--accent)]">{r.country}</Link>
                    ) : (
                      <span className="text-[var(--text)]">{r.country}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-semibold text-[var(--text)]">
                  {r.name}
                  {r.caveat ? (
                    <span
                      className="ml-1.5 text-[9px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 font-semibold"
                      style={{ borderColor: "#B4540A", color: "#D97706" }}
                      title={r.caveat}
                    >
                      caveat
                    </span>
                  ) : null}
                  <span className="block text-xs font-normal text-[var(--text-dim)]">{r.date}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  <span className="font-semibold text-[var(--text)]">{r.result}</span>{" "}
                  <span className="text-[var(--text-muted)]">{pct(r.resultPct)}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">{pct(r.turnout)}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)] min-w-72">{r.outcome}</td>
              </>
            ),
          }))}
        />
      </div>

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        {meta.note} {meta.sources[0]}. Poland 2015&apos;s 7.8% turnout is the lowest here; Chile
        1988&apos;s 97.5% the highest. Germany holds no national referendums at all — a deliberate
        postwar choice. Two rows here were decided by a rule rather than a majority:
        Italy&apos;s 2025 questions carried 65–88% of the votes cast and still fell to the 50%
        quorum, and Taiwan&apos;s 2025 nuclear question won three to one but missed the
        quarter-of-the-electorate bar. A turnout column is not decoration in those systems,
        it is the result.
      </footer>
    </main>
  );
}
