import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/volleyball/domestic";
const TITLE = "Domestic Volleyball";
const DESC = "Club volleyball's honours boards: Italy's SuperLega, Poland's PlusLiga, and Japan's SV.League. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function DomesticVolleyballPage() {
  const portal = getHonourPortal("volleyball-domestic");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/volleyball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Volleyball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/volleyball" className="hover:underline">Volleyball</Link>{" / "}
        <span>Domestic</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic Volleyball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Club volleyball&apos;s honours boards: Italy&apos;s SuperLega, Poland&apos;s PlusLiga,
          and Japan&apos;s SV.League. Winners only, by design.
        </p>
      </header>
      <HonourRolls portal={portal} order={["superlega", "plusliga", "svleague"]} />
    </main>
  );
}
