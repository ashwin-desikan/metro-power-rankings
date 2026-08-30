import type { Metadata } from "next";
import Link from "next/link";
import { getElectionSystems, band, type SystemHub } from "@/lib/electionSystems";
import { ELECTION_HUBS } from "@/lib/electionHubsMeta";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { BackButton } from "../HubShared";
import SortableTable from "../SortableTable";

const PATH = "/elections/systems";
const TITLE = "Electoral Systems";
const DESC =
  "How much do seats actually track votes? The Gallagher index of disproportionality for every legislative election in the atlas, from South Africa's near-perfect 0.50 to Britain's record 23.68 in 2024, set against the system each country uses.";

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

function Dot({ lsq }: { lsq: number }) {
  const b = band(lsq);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
      <span className="tabular-nums">{lsq.toFixed(2)}</span>
    </span>
  );
}

export default function SystemsPage() {
  const { hubs, families, method, built } = getElectionSystems();
  const withSeries = hubs.filter((h) => h.scored > 0);
  const gaps = hubs.filter((h) => h.scored === 0);

  const ranked = [...withSeries]
    .filter((h) => h.median != null)
    .sort((a, b) => (a.median as number) - (b.median as number));

  const scoredTotal = hubs.reduce((s, h) => s + h.scored, 0);
  const withTurnout = hubs.filter((h) => h.turnout != null);
  const turnoutTop = [...withTurnout].sort(
    (a, b) => (b.turnout?.medianPost1945 ?? 0) - (a.turnout?.medianPost1945 ?? 0),
  );
  const mostProportional = ranked[0];
  const leastProportional = ranked[ranked.length - 1];

  // The single most extreme contest anywhere in the atlas, and the calmest.
  const allRows = withSeries.flatMap((h) =>
    h.series.map((e) => ({ hub: h, e })),
  );
  const worstEver = allRows.reduce((a, b) => (a.e.lsq >= b.e.lsq ? a : b));
  const bestEver = allRows.reduce((a, b) => (a.e.lsq <= b.e.lsq ? a : b));

  const byFamily = new Map<string, SystemHub[]>();
  for (const h of withSeries) {
    if (!byFamily.has(h.family)) byFamily.set(h.family, []);
    (byFamily.get(h.family) as SystemHub[]).push(h);
  }
  const familyRows = [...byFamily.entries()]
    .map(([key, list]) => {
      const meds = list.map((h) => h.median).filter((m): m is number => m != null);
      return {
        key,
        label: families[key] ?? key,
        countries: list.length,
        median: meds.length ? meds.reduce((a, b) => a + b, 0) / meds.length : null,
      };
    })
    .filter((r) => r.median != null)
    .sort((a, b) => (a.median as number) - (b.median as number));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Systems</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/elections" label="All election hubs" />
        <BackButton href="/elections/all" label="Hubs A–Z" />
        <BackButton href="/elections/referendums" label="Referendums" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {scoredTotal.toLocaleString("en-US")} legislative elections scored across{" "}
          {withSeries.length} polities · built {built}
        </p>
      </header>

      {/* ---------- what the number means ---------- */}
      <section className="mb-8 rounded-2xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <h2 className="text-lg font-bold text-[var(--text)] mb-2">One number, and what it measures</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-3">
          The Gallagher index takes every party&apos;s share of the vote, subtracts its share of the
          seats, squares the differences, halves the total and takes the root. Zero means the chamber
          is a photograph of the electorate. The scale below is conventional, not invented here.
        </p>
        <div className="grid gap-2 sm:grid-cols-5 text-xs">
          {[0.5, 3, 7, 12, 20].map((v) => {
            const b = band(v);
            return (
              <div key={v} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: b.color }} />
                <span className="text-[var(--text)] font-semibold">
                  {v === 0.5 ? "under 2" : v === 3 ? "2–5" : v === 7 ? "5–10" : v === 12 ? "10–15" : "over 15"}
                </span>
                <span className="block text-[var(--text-dim)] mt-0.5">{b.label}</span>
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-4 text-sm">
          <p className="text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">The extreme:</span>{" "}
            {worstEver.hub.code === "uk" ? "Britain" : ELECTION_HUBS[worstEver.hub.code]?.name}{" "}
            {worstEver.e.year} at {n2(worstEver.e.lsq)}. A plurality system meeting a five-party
            electorate produces the widest gap between votes and seats in this atlas.
          </p>
          <p className="text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">The other end:</span>{" "}
            {ELECTION_HUBS[bestEver.hub.code]?.name} {bestEver.e.year} at {n2(bestEver.e.lsq)}. A
            single national district with no threshold is what near-zero looks like.
          </p>
        </div>
      </section>

      {/* ---------- by family ---------- */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">By family</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
          Mean of each country&apos;s median, so a country with two centuries on file does not drown
          one with three elections. The ordering is the argument: the systems designed to convert
          votes into seats do it, and the ones designed to produce a winner do that instead.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {familyRows.map((r) => {
            const b = band(r.median as number);
            return (
              <div key={r.key} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-[var(--text)] text-sm">{r.label}</span>
                  <span className="tabular-nums font-bold" style={{ color: b.color }}>
                    {(r.median as number).toFixed(2)}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-dim)]">
                  {r.countries} {r.countries === 1 ? "country" : "countries"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- the table ---------- */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Every polity with a series</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
          Median across each country&apos;s scored elections, with its most recent and its most
          extreme. Sham votes are kept in the series and out of the median: a ritual that hands one
          party every seat scores well and means nothing. Every column sorts.
        </p>
        <div className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
            cols={[
              { key: "country", label: "Country" },
              { key: "family", label: "System" },
              { key: "median", label: "Median" },
              { key: "latest", label: "Latest" },
              { key: "worst", label: "Worst" },
              { key: "n", label: "Scored" },
            ]}
            rows={withSeries.map((h) => {
              const meta = ELECTION_HUBS[h.code];
              return {
                key: h.code,
                sort: {
                  country: meta?.name ?? h.code,
                  family: h.familyLabel,
                  median: h.median,
                  latest: h.latest?.lsq ?? null,
                  worst: h.worst?.lsq ?? null,
                  n: h.scored,
                },
                cells: (
                  <>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={flagUrlByCode(meta?.flag ?? h.code)} srcSet={flagSrcSetByCode(meta?.flag ?? h.code)} alt="" width={20} height={15} className="rounded-[2px] shrink-0" />
                        <Link href={meta?.href ?? "/elections"} className="text-[var(--text)] hover:text-[var(--accent)] font-semibold">
                          {meta?.name ?? h.code}
                        </Link>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">
                      {h.familyLabel}
                      <span className="block text-[10px] text-[var(--text-dim)]">
                        {h.threshold ? `threshold: ${h.threshold}` : "no threshold"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{h.median != null ? <Dot lsq={h.median} /> : <span className="text-[var(--text-dim)]">—</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                      {h.latest ? `${h.latest.year} · ${n2(h.latest.lsq)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                      {h.worst ? `${h.worst.year} · ${n2(h.worst.lsq)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{h.scored}</td>
                  </>
                ),
              };
            })}
          />
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-2">
          Most proportional on the median: {ELECTION_HUBS[mostProportional.code]?.name} at{" "}
          {n2(mostProportional.median)}. Least:{" "}
          {ELECTION_HUBS[leastProportional.code]?.name} at {n2(leastProportional.median)}.
        </p>
      </section>


      {/* ---------- turnout ---------- */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Turnout, every polity</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
          The other half of how a system behaves. The landing page charts six countries over a
          century; this is all {withTurnout.length} that record turnout at all, on the same series each
          hub leads with. Rituals are kept out of the medians and left in the highs, which is where a
          reported 99% is worth seeing. Every column sorts.
        </p>
        <div className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]"
            cols={[
              { key: "country", label: "Country" },
              { key: "median", label: "Median since 1945" },
              { key: "latest", label: "Latest" },
              { key: "high", label: "Highest" },
              { key: "low", label: "Lowest" },
              { key: "n", label: "Elections" },
            ]}
            rows={turnoutTop.map((h) => {
              const meta = ELECTION_HUBS[h.code];
              const t = h.turnout as NonNullable<typeof h.turnout>;
              return {
                key: `t-${h.code}`,
                sort: {
                  country: meta?.name ?? h.code,
                  median: t.medianPost1945,
                  latest: t.latest.turnout,
                  high: t.high.turnout,
                  low: t.low.turnout,
                  n: t.n,
                },
                cells: (
                  <>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={flagUrlByCode(meta?.flag ?? h.code)} srcSet={flagSrcSetByCode(meta?.flag ?? h.code)} alt="" width={20} height={15} className="rounded-[2px] shrink-0" />
                        <Link href={meta?.href ?? "/elections"} className="text-[var(--text)] hover:text-[var(--accent)] font-semibold">
                          {meta?.name ?? h.code}
                        </Link>
                        {h.seriesKind === "presidential" ? (
                          <span className="text-[10px] text-[var(--text-dim)]">presidential</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--text)]">
                      {t.medianPost1945 != null ? `${t.medianPost1945.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                      {t.latest.year} · {t.latest.turnout.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                      {t.high.year} · {t.high.turnout.toFixed(1)}%
                      {t.high.unfree ? <span className="ml-1 text-[10px]" style={{ color: "#8E1B1B" }}>ritual</span> : null}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                      {t.low.year} · {t.low.turnout.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{t.n}</td>
                  </>
                ),
              };
            })}
          />
        </div>
      </section>
      {/* ---------- what cannot be computed ---------- */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">What this cannot measure yet</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
          An empty row would read as an oversight, so here is why each one is empty. Two of these are
          not limits of the method: the atlas records the seats but not the vote shares, and adding
          them would produce the series in full.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {gaps.map((h) => (
            <div key={h.code} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <span className="font-semibold text-[var(--text)]">{ELECTION_HUBS[h.code]?.name ?? h.code}</span>
              <span className="block text-xs text-[var(--text-muted)] mt-1">{h.gapReason}</span>
            </div>
          ))}
          {withSeries
            .filter((h) => h.noVoteShares > 0)
            .sort((a, b) => b.noVoteShares - a.noVoteShares)
            .slice(0, 4)
            .map((h) => (
              <div key={`p-${h.code}`} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <span className="font-semibold text-[var(--text)]">{ELECTION_HUBS[h.code]?.name ?? h.code}</span>
                <span className="block text-xs text-[var(--text-muted)] mt-1">
                  {h.noVoteShares} of its elections record seats without vote shares, which is why the
                  series stops at {h.latest?.year}. The system did not change; the data ran out.
                </span>
              </div>
            ))}
        </div>
      </section>

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        {method} Parties are those recorded in each hub, so the index is computed on the same figures
        the hub pages show, and can be checked against them. Built by{" "}
        <code>scripts/elections/build_systems.py</code>, which carries a self-test covering the
        hand-computable cases.
      </footer>
    </main>
  );
}
