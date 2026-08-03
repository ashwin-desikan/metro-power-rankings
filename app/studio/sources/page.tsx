import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Source registry & pipeline view (S1). The composable, warehouse-native
// ingestion story: fragmented fan-data feeds landing in one governed
// foundation. Feeds and run stats are synthetic, labeled as such.

const PATH = "/studio/sources";
const TITLE = "Source Registry & Pipeline";
const DESC =
  "Unified, governed ingestion: ticketing, CRM, app, web, and ad-platform feeds landing in one warehouse-native foundation, ready for identity resolution and activation. The composable-CDP posture, shown end to end.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#4ECDC4";

const STAGES = ["Sources", "Ingestion", "Identity resolution", "Governed foundation", "Activation"];

type Feed = {
  source: string; system: string; type: string; cadence: string; rows: string; status: "Healthy" | "Delayed";
};
const FEEDS: Feed[] = [
  { source: "Ticketing", system: "Ticketmaster / SeatGeek", type: "Batch", cadence: "Hourly", rows: "2.4M", status: "Healthy" },
  { source: "CRM", system: "Salesforce", type: "Batch", cadence: "Daily", rows: "1.1M", status: "Healthy" },
  { source: "Mobile app", system: "Segment", type: "Stream", cadence: "Real-time", rows: "18.6M / day", status: "Healthy" },
  { source: "Web", system: "GA4 / server-side", type: "Stream", cadence: "Real-time", rows: "31.2M / day", status: "Healthy" },
  { source: "Email / CRM engagement", system: "Braze", type: "Batch", cadence: "Hourly", rows: "640K", status: "Delayed" },
  { source: "Ad platforms", system: "Meta / Google / TTD", type: "Batch", cadence: "Daily", rows: "5.0M", status: "Healthy" },
  { source: "Commerce / merch", system: "Shopify", type: "Batch", cadence: "Daily", rows: "390K", status: "Healthy" },
];

export default function SourcesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/studio" className="hover:underline">Studio</Link>{" / "}
        <span>Sources</span>
      </nav>

      <header className="mb-6 max-w-3xl">
        <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: ACCENT }}>STUDIO / INGEST &amp; CONNECT</p>
        <h1 className="text-3xl font-semibold tracking-tight">Source registry &amp; pipeline</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Every fan signal a club or league owns, landing in one governed foundation instead of seven
          disconnected tools. The posture is composable and warehouse-native: data stays in your warehouse,
          and the CDP is a layer on top, not another silo. Feeds and run statistics below are synthetic,
          standing in for the real project feeds.
        </p>
      </header>

      {/* Pipeline diagram */}
      <section className="mb-8">
        <div className="rounded-xl border p-4 overflow-x-auto" style={card}>
          <div className="flex items-center gap-2 min-w-[640px]">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="rounded-lg border px-3 py-2 text-xs font-medium text-center"
                  style={{ borderColor: i === 3 ? ACCENT : "var(--border)", color: i === 3 ? ACCENT : "var(--text)" }}>
                  {s}
                </div>
                {i < STAGES.length - 1 && <span aria-hidden className="text-[var(--text-dim)]">→</span>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-dim)] mt-3">
            Orchestrated ingestion with retained provenance, the Lakeflow / composable-CDP pattern: each feed keeps its lineage from source to serving.
          </p>
        </div>
      </section>

      {/* Feed registry */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">Connected feeds</h2>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Source</th>
                <th className="py-2 px-3 font-medium">System</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Cadence</th>
                <th className="py-2 px-3 font-medium text-right">Volume</th>
                <th className="py-2 px-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {FEEDS.map((f) => (
                <tr key={f.source} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 font-medium">{f.source}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{f.system}</td>
                  <td className="py-2 px-3 text-xs">{f.type}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{f.cadence}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs" style={mono}>{f.rows}</td>
                  <td className="py-2 px-3 text-right text-xs">
                    <span style={{ color: f.status === "Healthy" ? ACCENT : "#f59e0b" }}>{f.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border p-4 max-w-3xl" style={card}>
        <p className="text-sm text-[var(--text-muted)]">
          From here, records flow into{" "}
          <Link href="/studio/identity" className="hover:underline" style={{ color: ACCENT }}>identity resolution</Link>,
          are governed by the{" "}
          <Link href="/studio/consent" className="hover:underline" style={{ color: ACCENT }}>consent console</Link>,
          and become segmentable and activatable in the{" "}
          <Link href="/studio/audience-builder" className="hover:underline" style={{ color: ACCENT }}>Audience Builder</Link>.
        </p>
      </section>
    </main>
  );
}
