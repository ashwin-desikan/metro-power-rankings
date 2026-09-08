import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRatesIndex, getBank, type RateChange } from "@/lib/economyRates";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, Crumbs, TabHeader, TableBox, SectionHead } from "../../../ui";
import EconomyNav from "../../EconomyNav";
import { CappedList } from "@/app/_shared/Disclosure";
import { DivergingBar } from "@/app/_shared/DataBar";
import RateChart from "./RateChart";

// Per-bank history page, /business/economy/rates/[code]. Contract:
// scripts/macro/RATES-CONTRACT.md. Data: exactly one file read via
// lib/economyRates.getBank(), never the whole 60-bank directory.

export const revalidate = 86400;

export const dynamicParams = false;
export function generateStaticParams() {
  const index = getRatesIndex();
  return (index?.banks ?? []).map((b) => ({ code: b.code }));
}

function fullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtLevel(n: number): string {
  const dp = Math.abs(Math.round(n * 1000) - Math.round(n * 100) * 10) > 0.5 ? 3 : 2;
  return `${n.toFixed(dp)}%`;
}


const SPINE_LABEL: Record<string, string> = {
  own: "own history",
  mixed: "own history joined to BIS",
  bis: "BIS daily levels",
};

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const bank = getBank(code);
  const name = bank?.name ?? code;
  const from = bank?.first_change.slice(0, 4);
  const title = `${name} Policy Rate, Charted Since ${from ?? ""}`.trim();
  const description = bank
    ? `The full decision history of the ${name}'s policy rate, ${bank.changes.length.toLocaleString()} entries from ${bank.first_change} to ${bank.last_change}, currently ${fmtLevel(bank.path[bank.path.length - 1]?.[1] ?? 0)}.`
    : `Policy rate history for ${name}.`;
  return {
    title: `${title} | Business of the Metros`,
    description,
    alternates: { canonical: `/business/economy/rates/${code}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description, url: `${BASE_URL}/business/economy/rates/${code}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function BankRatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bankOrNull = getBank(code);
  if (!bankOrNull) notFound();
  // Reassigning to a fresh const captures the non-null narrowing at this
  // point, which nested function declarations below (DecisionRow,
  // DecisionCard) cannot otherwise see through the closure.
  const bank = bankOrNull;

  const decisionRows = bank.changes.filter((c) => !c.break);
  const currentLevel = bank.path.length ? bank.path[bank.path.length - 1][1] : null;
  const currentInstrument = bank.instruments.find((ins) => ins.to === null) ?? bank.instruments[bank.instruments.length - 1];
  const newestFirst = [...bank.changes].reverse();

  const spineLabel = SPINE_LABEL[bank.coverage.spine] ?? bank.coverage.spine;
  const stamp = `as of ${bank.built} · ${spineLabel} · ${decisionRows.length.toLocaleString()} decisions since ${bank.first_change.slice(0, 4)}`;

  function DecisionRow({ c }: { c: RateChange }) {
    if (c.break) {
      return (
        <tr className="border-t" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <td className={TD} colSpan={4}>
            <span className="text-[var(--text-muted)] italic text-xs">{c.date}: {c.note}</span>
          </td>
        </tr>
      );
    }
    const instrument = bank.instruments[c.era];
    return (
      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
        <td className={`${TD} whitespace-nowrap`} style={MONO}>{c.date}</td>
        <td className={TDR} style={MONO}>
          {c.lower != null && c.upper != null
            ? `${fmtLevel(c.lower)}–${fmtLevel(c.upper)}`
            : c.level != null
              ? fmtLevel(c.level)
              : "—"}
        </td>
        <td className={TDR} style={MONO}>
          <DivergingBar v={c.change} dp={2} suffix="%" style={{ color: c.change == null ? "var(--text-dim)" : c.change >= 0 ? "var(--div-pos)" : "var(--div-neg)" }} />
        </td>
        <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}>{instrument?.name ?? "—"}</td>
      </tr>
    );
  }

  function DecisionCard({ c }: { c: RateChange }) {
    if (c.break) {
      return (
        <div className="p-3" style={{ background: "var(--bg-card)" }}>
          <p className="text-xs text-[var(--text-muted)] italic">{c.date}: {c.note}</p>
        </div>
      );
    }
    const instrument = bank.instruments[c.era];
    return (
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span style={MONO}>{c.date}</span>
          <span className="font-bold" style={MONO}>
            {c.lower != null && c.upper != null ? `${fmtLevel(c.lower)}–${fmtLevel(c.upper)}` : c.level != null ? fmtLevel(c.level) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] mt-0.5">
          <span>{instrument?.name ?? "—"}</span>
          <span style={MONO}>
            <DivergingBar v={c.change} dp={2} suffix="%" style={{ color: c.change == null ? "var(--text-dim)" : c.change >= 0 ? "var(--div-pos)" : "var(--div-neg)" }} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Economy" />
      <TabHeader
        emoji="🏦"
        title={bank.name}
        sub={`${currentInstrument?.name ?? "Policy rate"}, ${currentLevel != null ? fmtLevel(currentLevel) : "—"} since ${fullDate(bank.last_change)}.`}
        stamp={stamp}
      />
      <BusinessNav />
      <EconomyNav />

      <section className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <img src={flagUrlByCode(bank.iso2.toLowerCase())} srcSet={flagSrcSetByCode(bank.iso2.toLowerCase())} alt="" width={20} height={15} className="rounded-[2px]" />
        <span>{bank.country}</span>
        <span>·</span>
        <span>{bank.currency}</span>
        <span>·</span>
        <Link href="/business/economy" className="hover:underline" style={{ color: "var(--accent)" }}>all central banks</Link>
      </section>

      <section className="mb-8 rounded-2xl border p-4 sm:p-6 min-w-0" style={{ borderColor: "var(--border)" }}>
        <RateChart name={bank.name} path={bank.path} instruments={bank.instruments} built={bank.built} />
      </section>

      <section className="mb-10">
        <SectionHead
          title="Every decision"
          sub="Newest first; a shaded row marks a change of instrument."
        />
        <div className="hidden sm:block">
          <TableBox>
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                <th className={TH}>Date</th>
                <th className={THR}>Level</th>
                <th className={THR}>Change</th>
                <th className={TH}>Instrument</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((c, i) => <DecisionRow key={`${c.date}-${i}`} c={c} />)}
            </tbody>
          </TableBox>
        </div>
        <div className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
          <CappedList
            initial={12}
            noun="decisions"
            bodyClassName="divide-y divide-[var(--border)]"
            items={newestFirst.map((c, i) => <DecisionCard key={`${c.date}-${i}`} c={c} />)}
          />
        </div>
      </section>

      {bank.market.length > 0 && (
        <section className="mb-10">
          <SectionHead
            title="Market-rate spans"
            sub="Eras where the level is a BIS-observed market rate rather than a decision, summarised at each era's daily extremes."
          />
          <div className="hidden sm:block">
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Instrument</th>
                  <th className={TH}>From</th>
                  <th className={TH}>To</th>
                  <th className={THR}>Observations</th>
                  <th className={THR}>Min</th>
                  <th className={THR}>Max</th>
                </tr>
              </thead>
              <tbody>
                {bank.market.map((m) => (
                  <tr key={m.era} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TD}>{bank.instruments[m.era]?.name ?? "—"}</td>
                    <td className={TD} style={MONO}>{m.from}</td>
                    <td className={TD} style={MONO}>{m.to}</td>
                    <td className={TDR} style={MONO}>{m.observations.toLocaleString()}</td>
                    <td className={TDR} style={MONO}>{fmtLevel(m.min)}</td>
                    <td className={TDR} style={MONO}>{fmtLevel(m.max)}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </div>
            {/* One row per instrument era (bank.market); a bank never has more
                than a handful of eras, so no cap is needed. */}
          <div data-mobile-uncapped className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
            {bank.market.map((m) => (
              <div key={m.era} className="p-3">
                <div className="font-semibold text-sm">{bank.instruments[m.era]?.name ?? "—"}</div>
                <div className="text-xs text-[var(--text-muted)]" style={MONO}>{m.from} to {m.to} · {m.observations.toLocaleString()} obs</div>
                <div className="text-xs text-[var(--text-muted)]" style={MONO}>{fmtLevel(m.min)} – {fmtLevel(m.max)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2 max-w-3xl">
            A market era is a traded rate BIS uses as a proxy for the policy stance, not a rate the bank itself set by decision.
          </p>
        </section>
      )}

      <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">Where these numbers come from</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl mb-3">
          {bank.coverage.note}
        </p>
        <ul className="text-[13.5px] text-[var(--text-muted)] space-y-1">
          {bank.sources.map((s) => (
            <li key={s.url}>
              <Link href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>{s.label}</Link>
              {s.licence ? ` (${s.licence})` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
