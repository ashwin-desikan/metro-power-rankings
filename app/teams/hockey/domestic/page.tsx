import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/hockey/domestic";
const TITLE = "Domestic Hockey";
const DESC = "Club ice hockey outside the NHL: every KHL Gagarin Cup winner since 2009. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function DomesticHockeyPage() {
  const portal = getHonourPortal("hockey-domestic");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/hockey"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Ice Hockey
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/hockey" className="hover:underline">Ice Hockey</Link>{" / "}
        <span>Domestic</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic Hockey</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Club ice hockey beyond the NHL. The KHL&apos;s Gagarin Cup winners since the
          league&apos;s 2008-09 launch, winners only. More leagues to follow.
        </p>
      </header>
      <HonourRolls portal={portal} />
    </main>
  );
}
