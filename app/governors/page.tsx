import type { Metadata } from "next";
import Link from "next/link";
import { getAllStateGovernors, getTerritoryGovernors } from "@/lib/governors";
import { getState } from "@/lib/states";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/governors";
const TITLE = "US Governors";
const DESC =
  "The current governor of every US state and the five major US territories, with party and the date they took office. State governors link to their state hub; territory governors to their country page.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
};

function partyClass(p: string): string {
  const s = p.toLowerCase();
  if (s.includes("republican")) return "text-red-700 dark:text-red-400";
  if (s.includes("democratic")) return "text-blue-700 dark:text-blue-400";
  return "text-[var(--text-muted)]";
}
function yr(d: string): string {
  return d ? d.slice(0, 4) : "—";
}

export default function GovernorsPage() {
  const states = getAllStateGovernors();
  const terr = getTerritoryGovernors();

  const rows = Object.entries(states)
    .map(([slug, g]) => ({
      slug,
      stateName: getState(slug)?.name ?? slug,
      gov: g.name,
      party: g.party,
      since: g.since,
    }))
    .sort((a, b) => a.stateName.localeCompare(b.stateName));

  const trows = Object.entries(terr)
    .map(([slug, g]) => ({
      slug,
      country: g.countryName,
      gov: g.name,
      party: g.party,
      since: g.since,
    }))
    .sort((a, b) => a.country.localeCompare(b.country));

  const rep = rows.filter((r) => r.party.toLowerCase().includes("republican")).length;
  const dem = rows.filter((r) => r.party.toLowerCase().includes("democratic")).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/countries/united-states" className="hover:underline">United States</Link>
        {" / "}
        <span>{TITLE}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2">
          {rows.length} state governors ·{" "}
          <span className="text-red-700 dark:text-red-400">{rep} Republican</span> ·{" "}
          <span className="text-blue-700 dark:text-blue-400">{dem} Democratic</span>
        </p>
      </header>

      <section className="mb-10">
        <div
          className="rounded-xl border overflow-x-auto"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 px-4">State</th>
                <th className="py-2 px-4">Governor</th>
                <th className="py-2 px-4">Party</th>
                <th className="py-2 px-4 text-right">Since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-4">
                    <Link href={`/states/${r.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">
                      {r.stateName}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-[var(--text)]">{r.gov}</td>
                  <td className={`py-2 px-4 font-medium ${partyClass(r.party)}`}>{r.party}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{yr(r.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">US Territories</h2>
        <div
          className="rounded-xl border overflow-x-auto"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 px-4">Territory</th>
                <th className="py-2 px-4">Governor</th>
                <th className="py-2 px-4">Party</th>
                <th className="py-2 px-4 text-right">Since</th>
              </tr>
            </thead>
            <tbody>
              {trows.map((r) => (
                <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-4">
                    <Link href={`/countries/${r.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">
                      {r.country}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-[var(--text)]">{r.gov}</td>
                  <td className={`py-2 px-4 font-medium ${partyClass(r.party)}`}>{r.party}</td>
                  <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{yr(r.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Current as of mid-2026. The District of Columbia is led by a mayor, not a governor, and is not listed here.
      </footer>
    </main>
  );
}
