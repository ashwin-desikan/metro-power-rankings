import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Activation lift & holdout (S22). Closes the loop: a segment was activated, a
// holdout was withheld, and the incremental lift on a KPI is measured against
// it. The worked example below is synthetic, labeled as such; the method
// (exposed vs holdout, incrementality, not raw correlation) is the real one.

const PATH = "/studio/measurement";
const TITLE = "Activation Lift & Holdout";
const DESC =
  "Did the activation move the number? A holdout is withheld at activation and the exposed group is measured against it, so a campaign proves incremental lift rather than correlation. A worked, synthetic season-ticket-retention example.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#4ECDC4";
const GOLD = "#d4af37";

// Synthetic worked example: a high-churn-risk season-ticket segment, activated
// to CRM + Meta, with a 15% holdout withheld.
const EXPOSED = 41200;
const HOLDOUT = 7270;
const EXPOSED_RENEW = 0.612;
const HOLDOUT_RENEW = 0.547;

function pctLabel(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export default function MeasurementPage() {
  const liftPts = (EXPOSED_RENEW - HOLDOUT_RENEW) * 100;
  const relLift = ((EXPOSED_RENEW - HOLDOUT_RENEW) / HOLDOUT_RENEW) * 100;
  const incrementalRenewals = Math.round(EXPOSED * (EXPOSED_RENEW - HOLDOUT_RENEW));
  const groups = [
    { label: "Exposed", n: EXPOSED, rate: EXPOSED_RENEW, color: ACCENT },
    { label: "Holdout", n: HOLDOUT, rate: HOLDOUT_RENEW, color: "var(--text-dim)" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/studio" className="hover:underline">Studio</Link>{" / "}
        <span>Measurement</span>
      </nav>

      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: ACCENT }}>STUDIO / MEASURE</p>
        <h1 className="text-3xl font-semibold tracking-tight">Activation lift &amp; holdout</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The question after every activation is the only one that matters: did it move the number, or would
          those fans have renewed anyway? A holdout is withheld at activation, the exposed group is measured
          against it, and the difference is the incremental lift. The example below is synthetic, standing in
          for a real campaign readout; the method is exposed-versus-holdout incrementality, not raw correlation.
        </p>
      </header>

      <div className="rounded-lg border px-3 py-2 text-xs text-[var(--text-muted)] mb-6 inline-block" style={card}>
        Scenario: <span className="text-[var(--text)]">high-churn-risk season-ticket holders</span> · activated to CRM + Meta · 15% holdout · KPI: renewal rate
      </div>

      {/* Headline lift */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: GOLD }}>+{liftPts.toFixed(1)}<span className="text-base"> pts</span></div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Absolute lift</div>
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: ACCENT }}>+{relLift.toFixed(1)}%</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Relative lift</div>
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-2xl font-semibold tabular-nums" style={mono}>{incrementalRenewals.toLocaleString()}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Incremental renewals</div>
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-2xl font-semibold tabular-nums" style={mono}>95%</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Confidence (synthetic)</div>
        </div>
      </section>

      {/* Exposed vs holdout */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Renewal rate: exposed vs holdout</h2>
        <div className="rounded-xl border p-4 space-y-4" style={card}>
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--text-muted)]">{g.label} <span className="text-[var(--text-dim)]" style={mono}>· n={g.n.toLocaleString()}</span></span>
                <span className="tabular-nums font-semibold" style={{ ...mono, color: g.color }}>{pctLabel(g.rate)}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                <div className="h-full rounded-full" style={{ width: `${g.rate * 100}%`, backgroundColor: g.color }} />
              </div>
            </div>
          ))}
          <p className="text-[11px] text-[var(--text-dim)]">
            The gap between the bars, not the height of the exposed bar, is the result. The holdout is the
            counterfactual: what renewal looked like with no campaign.
          </p>
        </div>
      </section>

      <section className="rounded-xl border p-4 max-w-3xl" style={card}>
        <p className="text-sm text-[var(--text-muted)]">
          This is the honest end of the loop that begins in the{" "}
          <Link href="/studio/audience-builder" className="hover:underline" style={{ color: ACCENT }}>Audience Builder</Link>:
          build a governed segment, hold a slice back at activation, and report incremental lift against it.
          Measurement that an executive and an agent can both trust, because the foundation underneath it is governed.
        </p>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-6">
        Figures on this page are synthetic, included to demonstrate the measurement pattern rather than a real campaign.
      </p>
    </main>
  );
}
