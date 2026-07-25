import type { Metadata } from "next";
import { getScreen } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortTable, { type Col } from "../../sound/SortTable";
import ScreenNav from "../ScreenNav";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — Rankings by Metro";
const DESC =
  "Every metro scored by the film people it raised: era-normalized box office credit plus Academy Award prestige, summed over a century of directors, actors and craft nominees.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/rankings" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/rankings`, type: "website" },
};

export default function ScreenRankingsPage() {
  const f = getScreen();
  if (!f) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  const cols: Col[] = [
    { key: "rank", label: "#", kind: "rank" },
    { key: "name", label: "Metro", kind: "smetro", metroSlugKey: "slug", bold: true },
    { key: "country", label: "Country", mut: true },
    { key: "score", label: "Score", align: "right", numeric: true },
    { key: "people", label: "People", align: "right", numeric: true },
    { key: "topName", label: "Leading figure", mut: true },
  ];
  const rows = f.metros.slice(0, 200).map((m) => ({
    name: m.name, slug: m.slug, country: m.country,
    score: Math.round(m.score * 10) / 10, people: m.people,
    topName: m.top[0]?.name ?? "—",
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Rankings by metro</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Every film-year distributes the same points by box office share, split director-first
          down the billing order; every Oscar ceremony distributes the same prestige. A metro&apos;s
          score is the sum over the people it raised. Top 200 of {f.totals.metros.toLocaleString("en-US")} scored metros.
        </p>
      </header>
      <SortTable rows={rows} cols={cols} initialSort="score" />
    </main>
  );
}
