import type { Metadata } from "next";
import { getScreenOscars } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "../ScreenNav";
import OscarsView from "./OscarsView";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — Oscar Winners";
const DESC =
  "Every Academy Awards ceremony since 1929, one night at a time: the Big Six categories with every nominee and the winner in gold, and every other award of the night beneath.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/oscars" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/oscars`, type: "website" },
};

export default function ScreenOscarsPage() {
  const data = getScreenOscars();
  if (!data) return <main className="mx-auto max-w-4xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ScreenNav />
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Oscars, night by night</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--text-muted)]">
        {DESC} Pick a ceremony, or search any film, name or category across all {data.ceremonies.length} of
        them. This is the prestige signal behind the{" "}
        <a href="/screen/people" className="underline hover:text-[var(--accent)]">people rankings</a>.
      </p>
      <OscarsView ceremonies={data.ceremonies} />
    </main>
  );
}
