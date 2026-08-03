import type { Metadata } from "next";
import Link from "next/link";
import { getStatesDirectory, getStateLeaders } from "@/lib/statesDirectory";
import { getAllStateGovernors } from "@/lib/governors";
import StatesDirectory from "./StatesDirectory";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/states";
const TITLE = "States & Provinces";
const DESC =
  "Every state, province, and region by population, metros, and a population-weighted Metro Power score, with its country. Filterable by continent and country.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default async function StatesPage() {
  const rows = getStatesDirectory();
  const govs = await getAllStateGovernors();
  const governors: Record<string, { name: string; party?: string; second?: { name: string; role: string } }> = {};
  for (const [slug, g] of Object.entries(govs)) governors[slug] = { name: g.name, party: g.party };
  for (const [slug, l] of Object.entries(getStateLeaders())) {
    if (!governors[slug]) governors[slug] = { name: l.name, party: l.party, second: l.second };
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/countries" className="hover:underline">Countries</Link>
        {" / "}
        <span>States</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>
      <StatesDirectory rows={rows} governors={governors} />
    </main>
  );
}
