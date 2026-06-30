import type { Metadata } from "next";
import Link from "next/link";
import { getAllMayors } from "@/lib/mayors";
import { getAllMetros } from "@/lib/data";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PATH = "/mayors";
const TITLE = "Mayors of the World's Top Metros";
const DESC =
  "The mayor (or equivalent city leader) of the primary city of the 100 highest-ranked metro areas, linked to each metro. Refreshed weekly from open data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function yr(d: string): string {
  return d ? d.slice(0, 4) : "—";
}

export default async function MayorsPage() {
  const mayors = await getAllMayors();
  const metros = getAllMetros();
  const rankBySlug = new Map(metros.map((m) => [m.slug, m.rank ?? 9999] as const));
  const nameBySlug = new Map(metros.map((m) => [m.slug, m.name] as const));

  const rows = Object.entries(mayors)
    .map(([slug, m]) => ({ slug, metro: nameBySlug.get(slug) ?? slug, rank: rankBySlug.get(slug) ?? 9999, ...m }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>Mayors</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-2xl">{DESC}</p>
        <p className="text-sm text-[var(--text-dim)] mt-2">{rows.length} of the top 100 metros covered.</p>
      </header>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 px-4 text-right">#</th>
              <th className="py-2 px-4">Metro</th>
              <th className="py-2 px-4">City</th>
              <th className="py-2 px-4">Mayor</th>
              <th className="py-2 px-4">Party</th>
              <th className="py-2 px-4">Country</th>
              <th className="py-2 px-4 text-right">Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-dim)]">{r.rank}</td>
                <td className="py-2 px-4">
                  <Link href={`/rankings/${r.slug}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">{r.metro}</Link>
                </td>
                <td className="py-2 px-4 text-[var(--text-muted)]">{r.city}</td>
                <td className="py-2 px-4 text-[var(--text)]">
                  {r.mayor}
                  {r.second ? (
                    <span className="block text-xs text-[var(--text-muted)]">{r.second.name} ({r.second.role})</span>
                  ) : null}
                </td>
                <td className="py-2 px-4 text-[var(--text-muted)]">{r.party || "\u2014"}</td>
                <td className="py-2 px-4 text-[var(--text-muted)]">{r.country}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-muted)]">{yr(r.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        City leaders carry their local title (Mayor, Lord Mayor, Governor). For Chinese cities the elected mayor is shown with
        the Communist Party municipal secretary, who holds the senior role. Coverage grows as the curated overrides fill gaps.
      </footer>
    </main>
  );
}
