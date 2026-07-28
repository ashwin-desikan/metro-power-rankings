import type { Metadata } from "next";
import { getScreenNumberOnes } from "@/lib/screen";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ScreenNav from "../ScreenNav";
import NumberOnesView from "./NumberOnesView";

// ISR: re-render hourly and re-fetch the number-ones JSON from GitHub raw, so the weekly
// Tuesday [vercel skip] data refresh shows without a Vercel build (see lib/screen.ts).
export const revalidate = 3600;

const TITLE = "Screen of the Metros — US Number Ones";
const DESC =
  "Every film to top the US box office since 1946 — four thousand chart weeks, browsable by decade and year, with the all-time reign leaderboards. Updated weekly during the current year.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/screen/number-ones" },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}/screen/number-ones`, type: "website" },
};

export default async function ScreenNumberOnesPage() {
  const d = await getScreenNumberOnes();
  if (!d) return <main className="mx-auto max-w-6xl px-4 py-8"><p className="text-[var(--text-muted)]">Dataset not generated.</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ScreenNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">US number ones, week by week</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          {d.totals.weeks.toLocaleString("en-US")} chart weeks across {d.totals.years} years and{" "}
          {d.totals.films.toLocaleString("en-US")} films, {d.totals.withTt.toLocaleString("en-US")}{" "}
          of them joined to the rest of the hub through their IMDb identity. The film analogue of
          Sound&apos;s Number-One Machines.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <h2 className="font-bold text-sm text-[var(--text)] mb-2">Most weeks at №1, all-time</h2>
          <div className="grid gap-1 text-sm">
            {d.mostWeeks.slice(0, 10).map((m, i) => (
              <div key={m.target} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)]"><span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>{d.films[m.target]?.title ?? m.target}</span>
                <span className="tabular-nums text-[var(--text-muted)]">{m.weeks}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <h2 className="font-bold text-sm text-[var(--text)] mb-2">Longest unbroken reigns</h2>
          <div className="grid gap-1 text-sm">
            {d.longestReigns.slice(0, 10).map((r, i) => (
              <div key={r.target + r.start} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text)]"><span className="text-[var(--text-dim)] tabular-nums mr-2">{i + 1}</span>{d.films[r.target]?.title ?? r.target} <span className="text-xs text-[var(--text-dim)]">{r.start.slice(0, 4)}</span></span>
                <span className="tabular-nums text-[var(--text-muted)]">{r.weeks} weeks</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NumberOnesView films={d.films} years={d.years} />
    </main>
  );
}
