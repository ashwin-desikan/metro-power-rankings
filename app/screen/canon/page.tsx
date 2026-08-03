import type { Metadata } from "next";
import Link from "next/link";
import { getScreenCanon } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "../ScreenNav";
import CanonView from "./CanonView";

export const dynamic = "force-static";

const TITLE = "Screen of the Metros — The 500 Greatest Films";
const DESC =
  "The critical canon crossed with metro geography: the 500 greatest films of all time, each credited to its director and the metro that raised them — browsable by decade and year, with TMDb ratings and the box office hits marked.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/canon" },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/canon`, type: "website" },
};

export default function ScreenCanonPage() {
  const c = getScreenCanon();
  if (!c) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  const withSetting = c.films.filter((f) => f.setting).length;
  const setCount = c.films.filter((f) => f.setting?.via === "set").length;
  const hits = c.films.filter((f) => f.topGrosser).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">The 500 greatest films</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          The critical canon, placed on the map: {c.films.length} films, {withSetting} located in a
          real metro ({setCount} by where they are set, the rest by where they were filmed —
          marked). The unlocated remainder live in fictional or unplaceable worlds. Only {hits} of
          the 500 were also top-ten grossers of their year — the canon and the box office are
          different worlds. List:{" "}
          <a href={c.sourceUrl} className="underline hover:text-[var(--accent)]" rel="noopener noreferrer" target="_blank">
            Digital Dream Door&apos;s 500 Greatest Movies
          </a>, used with attribution — the film analogue of the{" "}
          <Link href="/sound/rolling-stone-500" className="underline hover:text-[var(--accent)]">RS 500</Link> in Sound.
        </p>
      </header>

      <div className="rounded-xl border p-4 mb-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <h2 className="font-bold text-sm text-[var(--text)] mb-2">Canon capitals <span className="font-normal text-xs text-[var(--text-dim)]">· where the 500 greatest films are set</span></h2>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {c.metroCounts.slice(0, 12).map((m) => (
            <span key={m.slug}>
              <Link href={`/rankings/${m.slug}`} className="text-[var(--text)] font-semibold hover:underline">{m.name}</Link>{" "}
              <span className="tabular-nums text-[var(--text-muted)]">{m.films}</span>
            </span>
          ))}
        </div>
      </div>

      <CanonView films={c.films} />
    </main>
  );
}
