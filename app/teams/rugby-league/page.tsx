import type { Metadata } from "next";
import Link from "next/link";
import HonourRolls from "@/app/teams/_shared/HonourRolls";
import { getHonourPortal } from "@/lib/honourRolls";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
const PATH = "/teams/rugby-league";
const TITLE = "Rugby League — Britain";
const DESC = "British rugby league's top-flight champions: the Northern Union, RFL Championship and Super League lineage since 1895. Winners only, by design.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default function RugbyLeaguePage() {
  const portal = getHonourPortal("rugby-league");
  if (!portal) return null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/sports"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to Sports
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Rugby League</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Rugby League — Britain</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          British rugby league&apos;s top-flight champions in one unbroken line: the Northern
          Union Championship (1895), the Rugby Football League Championship, and the Super
          League since 1996. Winners only, by design. Distinct from the rugby union game.
        </p>
      </header>
      <HonourRolls portal={portal} />
    </main>
  );
}
