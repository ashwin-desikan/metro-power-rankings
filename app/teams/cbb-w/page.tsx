import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import HubNav from "@/app/teams/HubNav";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllWcbbTeams, getWcbbNationalChampions } from "@/lib/wcbb";

export const dynamicParams = false;
const PATH = "/teams/cbb-w";
const TITLE = "Women's College Basketball";
const DESC =
  "Every NCAA Division I women's basketball program: the all-time tournament record (national titles, Final Fours, tournament appearances), national champions since 1982, and the programs that have defined the era.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default function WcbbHubPage() {
  const teams = getAllWcbbTeams();
  const d1 = teams.filter((t) => t.current_d1);
  const ranked = d1
    .slice()
    .sort((a, b) => b.titles - a.titles || b.final4 - a.final4 || b.tour_app - a.tour_app || b.pct - a.pct || a.name.localeCompare(b.name));
  const champs = getWcbbNationalChampions();
  const byTitles = teams.filter((t) => t.titles > 0).sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name)).slice(0, 10);
  const byF4 = teams.filter((t) => t.final4 > 0).sort((a, b) => b.final4 - a.final4 || a.name.localeCompare(b.name)).slice(0, 10);
  const link = (slug: string, name: string) => (
    <span className="inline-flex items-center gap-1.5">
      <CrestIcon name={name} size={16} />
      <Link href={`/teams/cbb-w/${slug}`} className="hover:text-[var(--accent)]">{name}</Link>
    </span>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <span>Women's College Basketball</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Women's College Basketball</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Every NCAA Division I program by its all-time tournament record: national
          titles, Final Fours and tournament appearances since the first NCAA women's
          tournament in 1982, with a page for each program.
        </p>
      </header>

      <HubNav
        items={[
          { label: "All-time programs", href: "#all-time" },
          { label: "National champions", href: "#champions" },
          { label: "Leaders", href: "#leaders" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- All-time programs ---------------- */}
      <section className="mb-10">
        <h2 id="all-time" className="text-lg font-semibold mb-1">All-time programs</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Current Division I programs, ordered by national titles, then Final Fours,
          then tournament appearances.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[600px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">#</th>
                <th className="py-2 px-3 font-medium">Program</th>
                <th className="py-2 px-3 font-medium">Conference</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Titles</th>
                <th className="py-2 px-3 text-right font-medium">Final Fours</th>
                <th className="py-2 px-3 text-right font-medium">Tour Apps</th>
                <th className="py-2 px-3 text-right font-medium">W-L</th>
                <th className="py-2 px-3 text-right font-medium">Win%</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t, i) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{i + 1}</td>
                  <td className="py-1.5 px-3 font-medium">{link(t.slug, t.name)}</td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{t.conference ?? ""}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ ...mono, color: t.titles > 0 ? GOLD : "var(--text-dim)" }}>{t.titles}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.final4}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.tour_app}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs" style={mono}>{t.w}-{t.l}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{t.pct.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- National champions ---------------- */}
      <section className="mb-10">
        <h2 id="champions" className="text-lg font-semibold mb-1">National champions</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">Every NCAA women's champion since 1982, with the runner-up and the rest of the Final Four.</p>
        <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium" style={{ color: GOLD }}>Champion</th>
                <th className="py-2 px-3 font-medium">Runner-up</th>
                <th className="py-2 px-3 font-medium">Final Four</th>
              </tr>
            </thead>
            <tbody>
              {champs.map((c) => (
                <tr key={c.year} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums font-medium" style={mono}>{c.year}</td>
                  <td className="py-1.5 px-3 font-semibold" style={{ color: GOLD }}>
                    {c.champs.map((x, i) => (<span key={x.name}>{i > 0 ? ", " : ""}{x.slug ? link(x.slug, x.name) : x.name}</span>))}
                  </td>
                  <td className="py-1.5 px-3 text-xs">
                    {c.runner_up.map((x, i) => (<span key={x.name}>{i > 0 ? ", " : ""}{x.slug ? link(x.slug, x.name) : x.name}</span>))}
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">
                    {c.final_four.map((x, i) => (<span key={x.name}>{i > 0 ? ", " : ""}{x.slug ? link(x.slug, x.name) : x.name}</span>))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Leaders ---------------- */}
      <section className="mb-10">
        <h2 id="leaders" className="text-lg font-semibold mb-3">Leaders</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4" style={card}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: GOLD }}>Most national titles</h3>
            <ol className="space-y-1 text-sm">
              {byTitles.map((t) => (
                <li key={t.slug} className="flex justify-between">
                  <span>{link(t.slug, t.name)}</span>
                  <span className="tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>{t.titles}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <h3 className="text-sm font-semibold mb-2">Most Final Fours</h3>
            <ol className="space-y-1 text-sm">
              {byF4.map((t) => (
                <li key={t.slug} className="flex justify-between">
                  <span>{link(t.slug, t.name)}</span>
                  <span className="tabular-nums" style={mono}>{t.final4}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)]">
          Program records are the all-time NCAA Division I women's tournament totals,
          covering every tournament since 1982. Each program is placed in its home
          metro for the city pages; metros are matched by campus. Titles are national
          championships, Final Fours are national-semifinal appearances, and tournament
          appearances count every NCAA bid.
        </p>
      </section>
    </main>
  );
}
