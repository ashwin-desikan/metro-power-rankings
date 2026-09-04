import type { Metadata } from "next";
import Link from "next/link";
import { getConflicts } from "@/lib/conflicts";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ConflictsTable from "./ConflictsTable";

const PATH = "/conflicts";
const TITLE = "Wars since 1500";
const DESC =
  "Five centuries of war: the interstate wars fought between sovereign states, and the notable civil wars labelled as such, with belligerents linked to their country pages throughout. Combat-death estimates are shown from 1945, where the source tracks them; the modern era refreshes monthly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default async function ConflictsPage() {
  const wars = await getConflicts();
  const ongoing = wars.filter((w) => w.ongoing).length;
  const major = wars.filter((w) => w.major).length;
  const civil = wars.filter((w) => w.civil).length;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}<span>{TITLE}</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2 tabular-nums">
          {wars.length} wars · {ongoing} ongoing · {major} major · {civil} civil wars
        </p>
      </header>
      <ConflictsTable wars={wars} />
      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Interstate war = armed conflict between sovereign states (excludes rebellions and purely colonial campaigns;
        wars of independence appear only where sovereign states fought on both sides). Notable civil wars, from the
        Wars of Religion and the Taiping Rebellion to Syria and Yemen, are included and carry a civil-war label. Predecessor states are
        mapped to their modern country where the continuation is clear: Ottoman Empire to Turkey, Prussia to Germany,
        the Russian Empire and Soviet Union to Russia; non-state forces are shown unlinked. Major = a war of the first
        rank (10,000+ combat deaths in the modern era). Sources: Wikipedia, “List of interstate wars since 1945”
        (refreshed monthly) and the “List of wars” series, 1500–1944, curated to notable interstate wars.
      </footer>
    </main>
  );
}
