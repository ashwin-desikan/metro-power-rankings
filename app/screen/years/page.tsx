import type { Metadata } from "next";
import { getScreenYears } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "../ScreenNav";
import YearsView from "./YearsView";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — Year by Year";
const DESC =
  "The top ten at the box office and the night's big Oscar winners, for every year since 1920 — browse the whole century decade by decade.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/years" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/years`, type: "website" },
};

export default function ScreenYearsPage() {
  const data = getScreenYears();
  if (!data) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Year by year</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">{DESC}</p>
      </header>
      <YearsView years={data.years} />
    </main>
  );
}
