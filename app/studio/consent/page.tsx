import type { Metadata } from "next";
import Link from "next/link";
import { getAudienceProfiles } from "@/lib/audience";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Consent & suppression console (S10). Aggregates the synthetic consent state
// carried on every profile so the governance gate is auditable: consent states,
// marketing purposes, and suppression reasons, all honored before activation.

const PATH = "/studio/consent";
const TITLE = "Consent & Suppression Console";
const DESC =
  "The governance layer of the Studio: consent states, marketing purposes, and suppression lists across the audience, honored before anything activates. Suppression overrides inclusion; consent gates eligibility.";

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
const RED = "#e74c3c";

const PURPOSES: { name: string; basis: string; gate: string }[] = [
  { name: "Marketing email", basis: "Consent", gate: "Opted-in only" },
  { name: "Personalized ads", basis: "Consent", gate: "Opted-in, non-suppressed" },
  { name: "Lookalike modeling", basis: "Legitimate interest", gate: "Opted-in seed only" },
  { name: "Product analytics", basis: "Legitimate interest", gate: "All, pseudonymized" },
  { name: "Partner / sponsor sharing", basis: "Consent", gate: "Explicit opt-in, clean room only" },
];

const SUPPRESSION_REASONS: { reason: string; share: number }[] = [
  { reason: "Global opt-out", share: 0.42 },
  { reason: "Do-not-contact request", share: 0.27 },
  { reason: "Hard bounce / undeliverable", share: 0.18 },
  { reason: "Recent complaint", share: 0.13 },
];

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 1000) / 10}%` : "0%";
}

export default function ConsentConsolePage() {
  const profiles = getAudienceProfiles();
  const total = profiles.length;
  let optedIn = 0, optedOut = 0, unknown = 0, suppressed = 0;
  for (const p of profiles) {
    if (p.governance.suppressed) suppressed++;
    else if (p.governance.consent === "opted_in") optedIn++;
    else if (p.governance.consent === "opted_out") optedOut++;
    else unknown++;
  }
  const addressable = optedIn; // suppression already removed above
  const states: { label: string; n: number; color: string }[] = [
    { label: "Opted in (addressable)", n: optedIn, color: ACCENT },
    { label: "Unknown consent", n: unknown, color: "var(--text-dim)" },
    { label: "Opted out", n: optedOut, color: GOLD },
    { label: "Suppressed", n: suppressed, color: RED },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/studio" className="hover:underline">Studio</Link>{" / "}
        <span>Consent &amp; Suppression</span>
      </nav>

      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: ACCENT }}>STUDIO / GOVERN</p>
        <h1 className="text-3xl font-semibold tracking-tight">Consent &amp; suppression console</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Privacy-first fan marketing is a gate, not an afterthought. Every record carries a consent state
          and a suppression flag; the rule is absolute and demonstrated everywhere downstream: suppression
          overrides inclusion, and consent gates eligibility rather than silently filtering. Consent values
          here are synthetic, attached to make the governance pattern auditable.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Consent across {total.toLocaleString()} records</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {states.map((s) => (
            <div key={s.label} className="rounded-xl border p-4" style={card}>
              <div className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: s.color }}>{s.n.toLocaleString()}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{s.label}</div>
              <div className="text-[11px] text-[var(--text-dim)]" style={mono}>{pct(s.n, total)}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-3">
          <span style={{ color: ACCENT }}>{addressable.toLocaleString()} addressable</span> is what any activation can reach today.
          The other {(total - addressable).toLocaleString()} are withheld by consent or suppression, and never leave the building.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Processing purposes</h2>
          <div className="rounded-xl border overflow-hidden" style={card}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Purpose</th>
                  <th className="py-2 px-3 font-medium">Lawful basis</th>
                  <th className="py-2 px-3 font-medium">Gate</th>
                </tr>
              </thead>
              <tbody>
                {PURPOSES.map((p) => (
                  <tr key={p.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 font-medium">{p.name}</td>
                    <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{p.basis}</td>
                    <td className="py-2 px-3 text-xs" style={{ color: ACCENT }}>{p.gate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Suppression list ({suppressed.toLocaleString()})</h2>
          <div className="rounded-xl border p-4 space-y-2.5" style={card}>
            {SUPPRESSION_REASONS.map((r) => {
              const n = Math.round(suppressed * r.share);
              return (
                <div key={r.reason} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[var(--text-muted)]">{r.reason}</span>
                    <span className="tabular-nums text-[var(--text-dim)]" style={mono}>{n.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(r.share * 100)}%`, backgroundColor: RED }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-[var(--text-dim)] pt-1">
              Suppression is checked first and wins over every inclusion rule and consent state.
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-xl border p-4 max-w-3xl" style={card}>
        <p className="text-sm text-[var(--text-muted)]">
          This console is the contract the rest of the Studio honors. When you build a cohort in the{" "}
          <Link href="/studio/audience-builder" className="hover:underline" style={{ color: ACCENT }}>Audience Builder</Link>{" "}
          and activate it, only opted-in, non-suppressed records sync, and the clean-room path exports
          aggregate cohorts only. The gate is enforced at activation, not just shown here.
        </p>
      </section>
    </main>
  );
}
