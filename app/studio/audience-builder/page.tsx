import type { Metadata } from "next";
import Link from "next/link";
import { getAudienceProfiles } from "@/lib/audience";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import AudienceBuilder from "./AudienceBuilder";

const PATH = "/studio/audience-builder";
const TITLE = "Audience Builder";
const DESC =
  "A composable audience builder on a stand-in first-party dataset: compose a cohort of metros across 16 dimensions, size it live, pass a consent and suppression gate, and activate to a mocked destination. A reference implementation of segmentation, governance, and reverse-ETL activation.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

export default function AudienceBuilderPage() {
  const total = getAudienceProfiles().length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>Studio</span>
        {" / "}
        <span>Audience Builder</span>
      </nav>

      <header className="mb-6">
        <p className="text-xs font-semibold tracking-widest text-[var(--accent)] mb-2">
          STUDIO / REFERENCE ARCHITECTURE
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Audience Builder</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          A composable audience builder, built on the metro dataset as a stand-in
          first-party audience. Compose a cohort across sixteen dimensions and a set
          of attributes, size it live, then pass a consent and suppression gate before
          activation. It is the same pattern as a composable CDP and reverse ETL,
          shown end to end on data that needs no NDA.
        </p>
        <p className="mt-3 text-xs text-[var(--text-dim)] max-w-3xl rounded-lg border px-3 py-2" style={card}>
          What is real and what is not: the metros, dimensions, and attributes are the
          live ranking dataset. Consent states, suppression flags, and destination
          syncs are synthetic, included to demonstrate the governance and activation
          pattern rather than a live integration.
        </p>
      </header>

      <AudienceBuilder total={total} />
    </main>
  );
}
