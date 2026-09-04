import type { Metadata } from "next";
import Link from "next/link";
import { getAudienceProfiles } from "@/lib/audience";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Studio: the reference-architecture hub. Frames the metro/sports platform as a
// martech reference implementation for sporting organizations, mapping each
// live surface to a stage of the fan-data lifecycle and a service line. The
// public metro product stays clean; the martech surfaces live here.

const PATH = "/studio";
const TITLE = "Studio: A Martech Reference Implementation";
const DESC =
  "How a fragmented fan-data stack becomes one resolved, governed, activated system. A working reference implementation of the fan-data lifecycle: ingestion, identity resolution, consent governance, audience building, and reverse-ETL activation, built on the metro and sports dataset as a stand-in first-party audience.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#4ECDC4";

type Surface = {
  stage: string;
  title: string;
  href: string | null;
  serviceLine: string;
  status: "Live" | "Planned";
  blurb: string;
  note: string; // "how I'd do this for your first-party data"
};

const SURFACES: Surface[] = [
  {
    stage: "1 · Ingest & connect",
    title: "Source registry & pipeline",
    href: "/studio/sources",
    serviceLine: "Connected Identity & Data Foundations",
    status: "Live",
    blurb: "Ticketing, CRM, app, web, and ad-platform feeds landing in one governed foundation.",
    note: "Map your real feeds to a single orchestrated ingestion layer; the warehouse stays the source of truth.",
  },
  {
    stage: "2 · Resolve identity",
    title: "Identity graph",
    href: "/studio/identity",
    serviceLine: "Connected Identity & Data Foundations",
    status: "Live",
    blurb: "One fan resolved across ticketing, app, email, and ad IDs, with provenance retained.",
    note: "Deterministic resolution with survivorship rules, so a fan is one person across every system.",
  },
  {
    stage: "3 · Govern",
    title: "Consent & suppression console",
    href: "/studio/consent",
    serviceLine: "Connected Identity & Data Foundations",
    status: "Live",
    blurb: "Consent states, purposes, and suppression lists, honored before anything activates.",
    note: "Privacy-first by construction: suppression overrides inclusion, consent gates eligibility.",
  },
  {
    stage: "5 · Segment",
    title: "Audience Builder",
    href: "/studio/audience-builder",
    serviceLine: "Audience, Activation & Commerce Media",
    status: "Live",
    blurb: "Describe a cohort in plain English or compose it across 16 dimensions and fan-level scores, size it live, read its signature, expand with lookalikes, save and share.",
    note: "The everyday segmentation workflow a marketer lives in, on governed first-party data.",
  },
  {
    stage: "6 · Activate",
    title: "Reverse-ETL activation",
    href: "/studio/audience-builder",
    serviceLine: "Audience, Activation & Commerce Media",
    status: "Live",
    blurb: "Push the addressable cohort to Meta, Google, CRM, a clean room, or CSV, with the gate enforced.",
    note: "Activation is the missing verb most stacks never close; here it runs from the same surface.",
  },
  {
    stage: "7 · Measure",
    title: "Lift & incrementality",
    href: "/studio/measurement",
    serviceLine: "Audience, Activation & Commerce Media",
    status: "Live",
    blurb: "Exposed-versus-holdout lift on a KPI, so a campaign proves it moved the number.",
    note: "Measurement that an executive and an agent can both trust because the foundation is governed.",
  },
  {
    stage: "8 · Decision & agents",
    title: "NL query & decisioning",
    href: null,
    serviceLine: "AI-Enabled Marketing & Operating Models",
    status: "Planned",
    blurb: "Natural-language audiences and an agent that picks the best audience, offer, and channel.",
    note: "Agentic operations land safely once resolution, consent, and lineage are already visible.",
  },
];

export default function StudioHubPage() {
  const total = getAudienceProfiles().length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>Studio</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold tracking-widest mb-2" style={{ color: ACCENT }}>
          STUDIO / REFERENCE ARCHITECTURE
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          A martech reference implementation for sporting organizations
        </h1>
        <p className="mt-3 text-sm sm:text-base text-[var(--text-muted)]">
          Most fan-data stacks are fragmented: ticketing here, the app there, CRM somewhere else, and
          ad platforms downstream of all of it. This Studio shows the whole lifecycle resolved into one
          governed, activated system, using the {total.toLocaleString()} metros of the ranking dataset as a
          stand-in first-party audience. Every pattern is real; the consent states and destination syncs
          are synthetic, included to make governance and activation demonstrable without an NDA.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/studio/audience-builder" className="rounded-md px-3 py-2 text-sm font-semibold"
            style={{ backgroundColor: ACCENT, color: "var(--bg)" }}>
            Open the Audience Builder →
          </Link>
          <a href="https://www.citizenofnowhere.org/practice" target="_blank" rel="noopener noreferrer"
            className="rounded-md border px-3 py-2 text-sm hover:border-[var(--accent)]" style={card}>
            The practice behind it ↗
          </a>
        </div>
      </header>

      {/* Capability map */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">The fan-data lifecycle</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SURFACES.map((s) => {
            const inner = (
              <div className="rounded-xl border p-4 h-full transition hover:border-[var(--accent)]" style={card}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wide" style={{ ...mono, color: "var(--text-dim)" }}>{s.stage}</span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: s.status === "Live" ? ACCENT : "var(--border)", color: s.status === "Live" ? ACCENT : "var(--text-dim)" }}>
                    {s.status}
                  </span>
                </div>
                <div className="font-semibold">{s.title}{s.href ? <span aria-hidden className="text-[var(--text-dim)]"> →</span> : null}</div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{s.blurb}</p>
                <div className="text-[11px] text-[var(--text-dim)] mt-2">{s.serviceLine}</div>
                <p className="text-[11px] mt-2 pt-2 border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <span className="font-medium" style={{ color: ACCENT }}>For your data: </span>{s.note}
                </p>
              </div>
            );
            return s.href ? (
              <Link key={s.title} href={s.href} className="block">{inner}</Link>
            ) : (
              <div key={s.title}>{inner}</div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border p-5 max-w-3xl" style={card}>
        <h2 className="text-sm font-semibold mb-1">How I would do this for your first-party data</h2>
        <p className="text-sm text-[var(--text-muted)]">
          The unglamorous parts are the point: identity resolution with retained provenance, consent that
          gates eligibility, lineage an executive and an agent can both trust, and activation that honors
          suppression every time. That is the work most vendors skip and most buyers have been burned by.
          I lead these as the primary integration partner, from foundations through activation and the
          operating model around them.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a href="https://www.citizenofnowhere.org/practice" target="_blank" rel="noopener noreferrer"
            className="rounded-md border px-3 py-2 hover:border-[var(--accent)]" style={card}>
            Service lines ↗
          </a>
          <a href="https://citizenofnowhere.substack.com" target="_blank" rel="noopener noreferrer"
            className="rounded-md border px-3 py-2 hover:border-[var(--accent)]" style={card}>
            Writing ↗
          </a>
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8 max-w-3xl">
        Everything synthetic (consent, identifiers, scores, syncs) is labeled as such. Credibility comes from
        the patterns being correct, not from faking live integrations.
      </p>
    </main>
  );
}
