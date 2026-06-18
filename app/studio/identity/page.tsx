import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Identity graph view (S5). The differentiator: one synthetic fan resolved
// across ticketing, app, email, and ad IDs into a single person, with the
// match signals and provenance retained. The fan and identifiers are an
// illustrative synthetic example; the resolution pattern is the real one.

const PATH = "/studio/identity";
const TITLE = "Identity Graph";
const DESC =
  "Deterministic identity resolution with retained provenance: one fan resolved across ticketing, app, email, and ad identifiers into a single profile, with match signals, survivorship, and identity-health metrics.";

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

type SourceRecord = {
  system: string; id: string; signals: string[]; matchedOn: string;
};
const RECORDS: SourceRecord[] = [
  { system: "Ticketing", id: "tm_88421907", signals: ["A. Rivera", "arivera@—", "season ticket"], matchedOn: "email + name" },
  { system: "Mobile app", id: "app_5f2c…91a", signals: ["device push token", "London", "loyalty tier 3"], matchedOn: "email (login)" },
  { system: "Email / CRM", id: "sf_0031N…7Qd", signals: ["arivera@—", "+44 7…", "opted in"], matchedOn: "email (deterministic)" },
  { system: "Ad platform", id: "meta_hash_3b9e…", signals: ["hashed email", "hashed phone"], matchedOn: "hashed email + phone" },
];

const HEALTH: { label: string; value: string; tone: "good" | "watch" }[] = [
  { label: "Match rate", value: "92.4%", tone: "good" },
  { label: "Unresolved", value: "7.6%", tone: "watch" },
  { label: "Avg. identifiers / fan", value: "3.1", tone: "good" },
  { label: "False-merge rate", value: "0.3%", tone: "good" },
];

export default function IdentityGraphPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/studio" className="hover:underline">Studio</Link>{" / "}
        <span>Identity Graph</span>
      </nav>

      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: ACCENT }}>STUDIO / RESOLVE IDENTITY</p>
        <h1 className="text-3xl font-semibold tracking-tight">Identity graph</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The decision a fan-data team makes thousands of times a day: are these the same person? Deterministic
          resolution stitches a fan's ticketing, app, email, and ad identifiers into one profile and keeps the
          provenance, so the merge is explainable and reversible. The fan and identifiers below are an
          illustrative synthetic example; the resolution pattern is the production one.
        </p>
      </header>

      {/* Resolution example */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Source records</h2>
          <div className="space-y-2">
            {RECORDS.map((r) => (
              <div key={r.system} className="rounded-lg border px-3 py-2.5" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.system}</span>
                  <code className="text-[11px] text-[var(--text-dim)]" style={mono}>{r.id}</code>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {r.signals.map((s) => (
                    <span key={s} className="text-[11px] px-1.5 py-0.5 rounded-full border text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>{s}</span>
                  ))}
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: ACCENT }}>matched on {r.matchedOn}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Resolved profile</h2>
          <div className="rounded-xl border p-4" style={{ ...card, borderColor: ACCENT }}>
            <div className="text-lg font-semibold">Fan #ZZ-100482</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">A. Rivera · London · loyalty tier 3</div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Linked identifiers</dt><dd className="tabular-nums" style={mono}>4</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Match confidence</dt><dd style={{ color: ACCENT }}>Deterministic</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Survivorship</dt><dd className="text-[var(--text-dim)]">CRM &gt; ticketing</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Reversible</dt><dd className="text-[var(--text-dim)]">Yes, with lineage</dd></div>
            </dl>
            <p className="text-[11px] text-[var(--text-dim)] mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              One person, four systems, resolved without losing where each attribute came from.
            </p>
          </div>
        </div>
      </section>

      {/* Identity health */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Identity health</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HEALTH.map((h) => (
            <div key={h.label} className="rounded-xl border p-4" style={card}>
              <div className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: h.tone === "good" ? ACCENT : "#f59e0b" }}>{h.value}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{h.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-3 max-w-3xl">
          These are the metrics that decide whether activation is safe. A low false-merge rate matters more
          than a high match rate: merging two fans into one is the error that quietly poisons a campaign.
        </p>
      </section>

      <section className="rounded-xl border p-4 max-w-3xl" style={card}>
        <p className="text-sm text-[var(--text-muted)]">
          A resolved, governed fan is what makes the rest possible: it is the unit the{" "}
          <Link href="/studio/consent" className="hover:underline" style={{ color: ACCENT }}>consent console</Link>{" "}
          governs and the{" "}
          <Link href="/studio/audience-builder" className="hover:underline" style={{ color: ACCENT }}>Audience Builder</Link>{" "}
          segments and activates.
        </p>
      </section>
    </main>
  );
}
