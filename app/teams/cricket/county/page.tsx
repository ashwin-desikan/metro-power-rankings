import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/cricket/county";
const TITLE = "County Championship";
const DESC = "England's first-class domestic cricket: every County Championship winner since 1890. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function CountyChampionshipPage() {
  const portal = getHonourPortal("cricket-county");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/cricket"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Cricket
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/cricket" className="hover:underline">Cricket</Link>{" / "}
        <span>County Championship</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">County Championship</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          England&apos;s first-class domestic competition, the oldest in the sport. Every
          champion since 1890, winners only. Counties are tracked at the competition
          level, not by metro, since most are county-wide rather than city clubs.
        </p>
      </header>
      <HonourRolls portal={portal} />
    </main>
  );
}
