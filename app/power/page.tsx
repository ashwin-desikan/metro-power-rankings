import type { Metadata } from "next";
import Link from "next/link";
import { getPowerRanking } from "@/lib/powerRanking";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/power";
const TITLE = "The 50 Most Powerful People";
const DESC =
  "An opinionated ranking of the world's most powerful people, scoring each by the Metro Power score of the place they govern, weighted by how much control they actually hold — heads of state, governors and mayors, central bankers, multilateral and alliance chiefs, and billionaires.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

const CAT: Record<string, string> = {
  National: "text-blue-700 dark:text-blue-300 bg-blue-500/10",
  "Sub-national": "text-teal-700 dark:text-teal-300 bg-teal-500/10",
  Mayor: "text-green-700 dark:text-green-300 bg-green-500/10",
  "US federal": "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10",
  Org: "text-purple-700 dark:text-purple-300 bg-purple-500/10",
  "Central bank": "text-amber-700 dark:text-amber-300 bg-amber-500/10",
  Billionaire: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10",
};

export default async function PowerPage() {
  const data = await getPowerRanking();
  const rows = data?.ranking ?? [];
  const max = rows.length ? rows[0].power : 1;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>Most Powerful People</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 px-4 text-right">#</th>
              <th className="py-2 px-4">Person</th>
              <th className="py-2 px-4 hidden sm:table-cell">Category</th>
              <th className="py-2 px-4 hidden md:table-cell">Jurisdiction</th>
              <th className="py-2 px-4 text-right">Power</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-4 text-right tabular-nums font-bold text-[var(--text-dim)]">{i + 1}</td>
                <td className="py-2 px-4">
                  <div className="font-medium text-[var(--text)]">{r.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{r.role}</div>
                </td>
                <td className="py-2 px-4 hidden sm:table-cell">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT[r.category] ?? "text-[var(--text-muted)]"}`}>{r.category}</span>
                </td>
                <td className="py-2 px-4 hidden md:table-cell text-[var(--text-muted)]">{r.jurisdiction}</td>
                <td className="py-2 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden lg:block h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, (r.power / max) * 70)}px` }} />
                    <span className="tabular-nums font-semibold text-[var(--text)]">{Math.round(r.power)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)] space-y-2" style={{ borderColor: "var(--border)" }}>
        <p>
          <strong>Method.</strong> Power = the Metro Power score of a person&rsquo;s jurisdiction × an influence weight for how much control
          they hold. National leaders scale with the V-Dem Liberal Democracy Index (a checked democracy counts for about half its country, an
          autocrat for nearly all of it), with a geopolitical multiplier for energy and military powers whose clout outruns their metros.
          Governors, mayors, central bankers, alliance and multilateral chiefs, and billionaires each carry their own weight; billionaires
          convert net worth into the same scale at a discount. It is deliberately opinionated, not a definitive measure.
        </p>
        <p>Recomputed weekly from the live leader feeds. {rows.length ? `Showing ${rows.length}.` : "Ranking unavailable."}</p>
      </footer>
    </main>
  );
}
