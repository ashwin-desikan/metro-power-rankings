import type { Metadata } from "next";
import Link from "next/link";
import { getConflicts } from "@/lib/conflicts";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ConflictsTable from "./ConflictsTable";

const PATH = "/conflicts";
const TITLE = "Interstate Wars since 1945";
const DESC =
  "Every interstate war since 1945 — the wars fought between sovereign states, with belligerents linked to their country pages, dates, and combat-death estimates. Sourced from Wikipedia and refreshed monthly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default async function ConflictsPage() {
  const wars = await getConflicts();
  const ongoing = wars.filter((w) => w.ongoing).length;
  const major = wars.filter((w) => w.major).length;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}<span>{TITLE}</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {wars.length} wars · {ongoing} ongoing · {major} with 10,000+ combat deaths
        </p>
      </header>
      <ConflictsTable wars={wars} />
      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Interstate war = armed conflict between sovereign states with 100+ combat deaths (excludes civil wars and wars of
        independence). Predecessor states are mapped to their modern country where the continuation is clear; contested
        successions (the Soviet Union, Yugoslavia, Czechoslovakia) and non-state forces are shown unlinked. Source:
        Wikipedia, “List of interstate wars since 1945.”
      </footer>
    </main>
  );
}
