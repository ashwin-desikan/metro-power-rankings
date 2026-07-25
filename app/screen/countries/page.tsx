import type { Metadata } from "next";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortTable, { type Col } from "../../sound/SortTable";
import ScreenNav from "../ScreenNav";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — Rankings by Country";
const DESC =
  "Every country scored by the film talent it raised: its metros' filmmakers summed into one national total, from box office to Academy prestige to cinematic-consensus significance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/countries" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/countries`, type: "website" },
};

export default function ScreenCountriesPage() {
  const f = getScreen();
  if (!f) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  const cols: Col[] = [
    { key: "rank", label: "#", kind: "rank" },
    { key: "name", label: "Country", kind: "scountry", slugKey: "slug", bold: true },
    { key: "score", label: "Score", align: "right", numeric: true },
    { key: "people", label: "People", align: "right", numeric: true },
    { key: "metros", label: "Metros", align: "right", numeric: true },
    { key: "topName", label: "Leading figure", mut: true },
  ];
  const rows = (f.countries ?? []).map((c) => ({
    name: c.name, slug: c.slug, score: Math.round(c.score * 10) / 10,
    people: c.people, metros: c.metros, topName: c.top[0]?.name ?? "—",
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Rankings by country</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Each filmmaker is attributed to a home metro, and each metro to a country; a country&apos;s score is
          the sum over everyone it raised. {(f.countries ?? []).length} countries scored.
        </p>
      </header>
      <SortTable rows={rows} cols={cols} initialSort="score" />
    </main>
  );
}
