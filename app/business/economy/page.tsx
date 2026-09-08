import type { Metadata } from "next";
import Link from "next/link";
import { getRatesIndex, getBank, bankHref, type BankFile } from "@/lib/economyRates";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";
import EconomyNav from "./EconomyNav";
import { DataBar } from "@/app/_shared/DataBar";
import RatesTable, { type RateRow } from "./RatesTable";

export const revalidate = 21600;

const PATH = "/business/economy";
const TITLE = "Policy Rates";
const DESC =
  "Every central bank's policy rate, tracked back to its own founding where the bank has published its own history: the Bank of England from 1694, the Fed from 1913, forty-nine banks joined by the BIS.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

// 2dp normally, 3dp when the value carries a real third decimal (e.g. the
// Riksbank's 3.625%) - never trailing-zero-pad a 2dp figure to 3.
function fmtPct(n: number): string {
  const dp = Math.abs(Math.round(n * 1000) - Math.round(n * 100) * 10) > 0.5 ? 3 : 2;
  return `${n.toFixed(dp)}%`;
}

// Sentences for the eleven banks with founding dates on record, per the
// scoping doc (RATES-CONTRACT.md, "Sources of record"). Static because the
// index carries only a series start, not this institutional narrative.
const FOUNDING_NOTES: Record<string, string> = {
  boe: "The Bank of England was founded in 1694; its Bank Rate history begins the same year.",
  riksbank: "Sveriges Riksbank was founded in 1668, the world's oldest central bank; its rate history begins in 1907.",
  norges: "Norges Bank was founded in 1816; its discount rate history begins in 1818.",
  boj: "The Bank of Japan was founded in 1882, with a policy rate on record from its first year.",
  snb: "The Swiss National Bank was founded in 1907, with a policy rate on record from its first year.",
  fed: "The Federal Reserve was founded in 1913; its discount rate history begins in 1914.",
  rbnz: "The Reserve Bank of New Zealand was founded in 1934, with a policy rate on record from its first year.",
  boc: "The Bank of Canada was founded in 1935, with a policy rate on record from its first year.",
  buba: "The Bundesbank ran from 1948 until 1998, when it ceded rate-setting to the ECB.",
  rba: "The Reserve Bank of Australia was founded in 1960; its cash rate target begins in 1990.",
  ecb: "The European Central Bank was founded in 1998; its first rate was set on 1 January 1999.",
};
const FOUNDING_ORDER = ["boe", "riksbank", "norges", "boj", "snb", "fed", "rbnz", "boc", "buba", "rba", "ecb"];

function lastMove(bank: BankFile | null): { date: string; change: number | null } | null {
  if (!bank) return null;
  const rows = bank.changes.filter((c) => !c.break && typeof c.change === "number");
  if (!rows.length) return { date: bank.last_change, change: null };
  const last = rows[rows.length - 1];
  return { date: last.date, change: last.change ?? null };
}

export default async function EconomyPage() {
  const index = await getRatesIndex();
  const banks = index?.banks ?? [];
  const founded = banks.filter((b) => b.founded);
  // Full bank files are needed only for the last decision's signed change
  // (not carried in the index); 49 files at ~50KB average is well inside the
  // function-size budget for one route. See lib/economyRates.ts.
  const full = new Map(await Promise.all(banks.map(async (b) => [b.code, await getBank(b.code)] as const)));

  const rows: RateRow[] = banks.map((b) => {
    const move = lastMove(full.get(b.code) ?? null);
    return {
      code: b.code,
      name: b.name,
      short: b.short,
      iso2: b.iso2,
      founded: b.founded,
      series_from: b.series_from,
      last_change: b.last_change,
      level: b.level,
      changes_12m: b.changes_12m,
      hold_days: b.hold_days,
      direction_12m: b.direction_12m,
      power_rank: b.power_rank,
      ended: b.ended,
      ended_note: b.ended_note,
      moveDate: move?.date ?? null,
      moveChange: move?.change ?? null,
    };
  });

  // Ended banks (the ten euro joiners) no longer make decisions, so they are
  // excluded from both "who moved" and "the longest holds" - both boards are
  // about live policy behaviour, not superseded history.
  const living = banks.filter((b) => !b.ended);
  const movers = living.filter((b) => b.changes_12m > 0);
  const cutting = movers.filter((b) => b.direction_12m === "cutting");
  const hiking = movers.filter((b) => b.direction_12m === "hiking");
  const mixed = movers.filter((b) => b.direction_12m === "mixed");
  const longestHolds = living
    .filter((b) => b.hold_days != null && b.direction_12m !== "market")
    .sort((a, b) => (b.hold_days ?? 0) - (a.hold_days ?? 0))
    .slice(0, 10);

  function BankLink({ b }: { b: { code: string; name: string; short: string } }) {
    return (
      <Link href={bankHref(b.code)} className="hover:underline font-semibold" style={{ color: "var(--accent)" }}>
        {b.name}
      </Link>
    );
  }

  const stamp = index
    ? `as of ${index.built} · ${banks.length} central banks · ${founded.length} with their own history to founding · BIS join layer`
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Economy" />
      <TabHeader
        emoji="🏦"
        title="Policy rates"
        sub="Every central bank's policy rate, tied to its own decision history back to founding where one exists."
        stamp={stamp}
      />
      <BusinessNav />
      <EconomyNav />

      {!index ? (
        <p className="text-sm text-[var(--text-muted)]">The rates dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-8 rounded-2xl border p-4 sm:p-5 flex flex-wrap items-baseline justify-between gap-2" style={CARD}>
            <p className="text-[13.5px] text-[var(--text-muted)] max-w-2xl">
              Every bank below opens its own decision history, step-charted since its first change.
              Or put several on one axis, in their own per cent terms.
            </p>
            <Link
              href="/business/economy/compare"
              className="rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--bg-card)" }}
            >
              Compare central banks →
            </Link>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Where rates stand"
              sub="Every tracked central bank, sortable by level, last move, direction or hold."
              more="Level is the current policy rate (or the latest BIS-observed market rate where the bank has no policy instrument today). Trailing year reads the sign of moves over the last 365 days. The default order leads with the Fed, the ECB and the Bank of England, then every other bank by its power rank, with the ten banks superseded by the euro listed last."
            />
            <RatesTable rows={rows} />
          </section>

          <section className="mb-10">
            <SectionHead
              title="Who moved this year"
              sub="Live banks with at least one decision in the trailing 365 days, grouped by direction."
            />
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              {[
                { label: "Cutting", rows: cutting },
                { label: "Hiking", rows: hiking },
                { label: "Mixed", rows: mixed },
              ].map((g) => (
                <div key={g.label} className="rounded-xl border p-4 min-w-0" style={CARD}>
                  <div className="text-xs uppercase tracking-widest mb-2 text-[var(--text-muted)]" style={MONO}>
                    {g.label} · {g.rows.length}
                  </div>
                  {g.rows.length === 0 ? (
                    <p className="text-sm text-[var(--text-dim)]">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.rows.map((b) => (
                        <Link
                          key={b.code}
                          href={bankHref(b.code)}
                          className="rounded-full border px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)] min-h-11 flex items-center"
                          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                        >
                          {b.short}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="The longest holds"
              sub="Top ten among live policy-rate banks by days since the last decision."
            />
            <div className="hidden sm:block">
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Bank</th>
                    <th className={THR}>Level</th>
                    <th className={THR}>Hold</th>
                    <th className={TH}>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {longestHolds.map((b) => (
                    <tr key={b.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} whitespace-nowrap`}><BankLink b={b} /></td>
                      <td className={TDR} style={MONO}><DataBar v={b.level} format={fmtPct} label="policy rate" /></td>
                      <td className={TDR} style={MONO}>{b.hold_days}d</td>
                      <td className={`${TD} text-[var(--text-muted)]`}>{b.last_change}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            {/* Bounded to top 10 above (.slice(0, 10)); no cap needed. */}
            <div data-mobile-uncapped className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
              {longestHolds.map((b) => (
                <div key={b.code} className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <BankLink b={b} />
                    <span className="font-bold tabular-nums" style={MONO}><DataBar v={b.level} format={fmtPct} label="policy rate" /></span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]" style={MONO}>{b.hold_days}d since {b.last_change}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Own history to founding"
              sub="Eleven banks publish their own decision table back to (or near) their founding; BIS fills every other economy from its daily levels."
            />
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              {FOUNDING_ORDER.map((code) => {
                const b = banks.find((x) => x.code === code);
                if (!b) return null;
                return (
                  <div key={code} className="rounded-xl border p-4 min-w-0" style={CARD}>
                    <Link href={bankHref(code)} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                      {b.name}
                    </Link>
                    <p className="text-[13px] text-[var(--text-muted)] mt-1">{FOUNDING_NOTES[code]}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">Where these numbers come from</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              BIS central bank policy rates (<Link href="https://data.bis.org/topics/CBPOL" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>CBPOL</Link>) join every economy that does not publish its own machine-readable decision table.
              Where a bank does, that own table is the spine: FRED for the Federal Reserve, the ECB Data Portal for the euro area, Bank of England via datahub, and each bank&apos;s own statistics, cited on its page.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
