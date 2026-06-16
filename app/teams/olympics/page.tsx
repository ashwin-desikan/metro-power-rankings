import type { Metadata } from "next";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { getAllOlympicTeams, getOlympicsHub } from "@/lib/olympics";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import AllTimeTable from "./AllTimeTable";

export const dynamicParams = false;
const PATH = "/teams/olympics";
const TITLE = "Olympics";
const DESC =
  "Every Olympic Games since 1896: the all-time medal table across all Summer and Winter editions plus the 1906 Intercalated Games, with historical lineages folded into their modern nations and a page for every team to win a medal.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function OlympicsHubPage() {
  const hub = getOlympicsHub();
  const teams = getAllOlympicTeams();
  if (!hub) return null;

  const slugByName = new Map(teams.map((t) => [t.name, t.slug]));
  const teamLink = (name: string, className?: string) => {
    const slug = slugByName.get(name);
    return slug ? (
      <Link href={`/teams/olympics/${slug}`} className={`hover:text-[var(--accent)] ${className ?? ""}`}>
        {name}
      </Link>
    ) : (
      <span className={className}>{name}</span>
    );
  };
  const nations = teams.filter((t) => !t.special);
  const specials = teams.filter((t) => t.special);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Olympics</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Olympics</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          The complete medal record: all {hub.totals.editions} Games from Athens 1896
          through Milano-Cortina 2026 — every Summer and Winter edition plus the 1906
          Intercalated Games — with historical lineages folded into their modern
          nations, from the Soviet Union into Russia to Bohemia into Czechia, and a
          page for every team ever to win a medal.
        </p>
      </header>

      <HubNav
        items={[
          { label: "All-time Medals", href: "#all-time" },
          { label: "Editions", href: "#editions" },
          { label: "Special Teams", href: "#special" },
          { label: "Methodology", href: "#methodology" },
        ]}
      />

      {/* ---------------- All-time table ---------------- */}
      <section className="mb-10">
        <h2 id="all-time" className="text-lg font-semibold mb-1">All-time medal table</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Lineages folded into modern nations; ordered by gold within the selected
          scope. 1906 counts within Summer.
        </p>
        <AllTimeTable rows={nations} />
      </section>

      {/* ---------------- Editions ---------------- */}
      <section className="mb-10">
        <h2 id="editions" className="text-lg font-semibold mb-1">Every Games</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Medal leaders per edition; the two 1956 Summer hostings (Melbourne and
          Stockholm) are combined.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Games</th>
                <th className="py-2 px-3 text-right font-medium">Nations</th>
                <th className="py-2 px-3 text-right font-medium">Medals</th>
                <th className="py-2 px-3 font-medium">Top of the table</th>
              </tr>
            </thead>
            <tbody>
              {hub.editions.slice().reverse().map((e) => (
                <tr key={`${e.year}-${e.season}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <Link href={`/teams/olympics/games/${e.season.toLowerCase()}-${e.year}`} className="hover:text-[var(--accent)]">
                      <span className="tabular-nums font-medium" style={mono}>{e.year}</span>
                      <span className="text-xs text-[var(--text-muted)]"> {e.season}</span>
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{e.nations}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{e.medals.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-xs">
                    {e.top.map((tp, i) => (
                      <span key={tp.name}>
                        {i > 0 ? " · " : ""}
                        {teamLink(tp.name, i === 0 ? "font-semibold" : "")}
                        <span className="text-[var(--text-dim)]" style={mono}> {tp.g}G</span>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Special teams ---------------- */}
      <section className="mb-10">
        <h2 id="special" className="text-lg font-semibold mb-1">Special and historical teams</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Combined sides, dissolved states kept whole, and neutral delegations.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {specials.map((t) => (
            <Link key={t.slug} href={`/teams/olympics/${t.slug}`}
                  className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
                  style={card}>
              <div className="font-semibold mb-1">{t.name}</div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                {t.g}G {t.s}S {t.b}B · {t.apps} Games · {t.first}–{t.last}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- Methodology ---------------- */}
      <section id="methodology" className="rounded-xl border p-5 text-sm" style={card}>
        <h2 className="text-base font-semibold mb-2">Sources &amp; methodology</h2>
        <p className="text-[var(--text-muted)] mb-2">
          Medal tables from the Olympedia historical record, every Summer and Winter
          Games plus the 1906 Intercalated Games — which we count fully in all-time
          totals as a deliberate editorial choice; the IOC excludes it. Historical
          delegations fold into their modern lineages (Soviet Union, Unified Team and
          ROC into Russia; Yugoslavia and Serbia &amp; Montenegro into Serbia; Bohemia
          and Czechoslovakia into Czechia; West Germany into Germany; the United Arab
          Republic into Egypt), with each Games row attributed to the name the team
          competed under.
        </p>
        <p className="text-[var(--text-muted)]">
          East Germany stands alone as a dissolved state, and the combined and neutral
          teams (Australasia, the West Indies Federation, the Netherlands Antilles,
          the Refugee Olympic Team, Independent and Neutral athletes, and the early
          Mixed teams) keep their own pages rather than being folded into anyone&apos;s
          totals.
        </p>
      </section>
    </main>
  );
}
