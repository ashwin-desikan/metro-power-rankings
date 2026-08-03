import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/basketball/domestic";
const TITLE = "Domestic Basketball";
const DESC = "Club basketball outside the NBA and EuroLeague: every Chinese Basketball Association champion. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function DomesticBasketballPage() {
  const portal = getHonourPortal("basketball-domestic");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/basketball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Basketball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/basketball" className="hover:underline">Basketball</Link>{" / "}
        <span>Domestic</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domestic Basketball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Club basketball beyond the NBA and the EuroLeague. The Chinese Basketball
          Association champions roll, winners only. More leagues to follow.
        </p>
      </header>
      <HonourRolls portal={portal} />
    </main>
  );
}
