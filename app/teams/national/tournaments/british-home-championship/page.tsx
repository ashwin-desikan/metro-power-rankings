import type { Metadata } from "next";
import Link from "next/link";
import { flagCdnUrl, displayNameForTeam } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { readFileSync } from "fs";
import { join } from "path";

export const metadata: Metadata = {
  title: "British Home Championship & Rous Cup",
  description:
    "Full results for the British Home Championship (1884–1984) and Rous Cup (1985–1989), with all shared titles and tied placings.",
  alternates: { canonical: "/teams/national/tournaments/british-home-championship" },
  openGraph: {
    title: `British Home Championship & Rous Cup | ${SITE_NAME}`,
    description: "Complete results 1884–1989.",
    url: `${BASE_URL}/teams/national/tournaments/british-home-championship`,
    type: "website",
  },
};

type Edition = {
  year: number;
  tournament: string;
  first: string[];
  second: string[];
  third: string[];
  fourth: string[];
};

type BhcData = {
  meta: {
    label: string;
    year_min: number;
    year_max: number;
    teams: Record<string, { slug: string; name: string; wins: number }>;
  };
  editions: Edition[];
};

function loadData(): BhcData {
  const raw = readFileSync(
    join(process.cwd(), "public/data/international/british-home-championship.json"),
    "utf-8"
  );
  return JSON.parse(raw) as BhcData;
}

const SLUG_NAME: Record<string, string> = {
  "england": "England",
  "scotland": "Scotland",
  "wales": "Wales",
  "northern-ireland": "Northern Ireland",
  "brazil": "Brazil",
  "colombia": "Colombia",
};

function TeamCell({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5">
      {slugs.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[var(--text-dim)] text-[10px]">tie</span>}
          {flagCdnUrl(s) && (
            <img src={flagCdnUrl(s)!} alt="" aria-hidden width={16} height={12} className="inline-block flex-shrink-0" />
          )}
          <Link
            href={`/teams/national/${s}`}
            className="hover:text-[var(--accent)] hover:underline transition-colors"
          >
            {displayNameForTeam(s, SLUG_NAME[s] ?? s)}
          </Link>
        </span>
      ))}
    </span>
  );
}

export default function BritishHomeChampionshipPage() {
  const data = loadData();
  const bhc = data.editions.filter((e) => e.tournament === "British Home Championship");
  const rous = data.editions.filter((e) => e.tournament === "Rous Cup");

  const teams = Object.values(data.meta.teams).filter((t) => t.wins > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/national/tournaments/other-tournaments"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Other Tournaments
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/national" className="hover:underline">International Football</Link>
        {" / "}
        <Link href="/teams/national/tournaments/other-tournaments" className="hover:underline">Other Tournaments</Link>
        {" / "}
        <span>British Home Championship</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">British Home Championship &amp; Rous Cup</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl">
          The British Home Championship ran annually from 1884 to 1984 between England, Scotland, Wales, and Ireland
          (Northern Ireland from 1921). It was replaced by the Rous Cup (1985–1989), a smaller invitational.
          Shared titles occur where teams finished level on points; those years are shown with a tie marker.
          All &ldquo;Ireland&rdquo; entries refer to Northern Ireland.
        </p>
      </header>

      {/* Summary */}
      <section
        className="rounded-xl border p-5 mb-8"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold mb-3">All-time titles (outright + shared)</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {teams.sort((a, b) => b.wins - a.wins).map((t) => (
            <li
              key={t.slug}
              className="flex items-center justify-between border-b py-1"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="inline-flex items-center gap-1.5">
                {flagCdnUrl(t.slug) && (
                  <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={18} height={13} className="inline-block" />
                )}
                <Link href={`/teams/national/${t.slug}`} className="hover:underline">
                  {t.name}
                </Link>
              </span>
              <span className="tabular-nums font-semibold">{t.wins}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--text-dim)]">
          These titles are not counted toward each team&apos;s main honors totals — the BHC and Rous Cup are shown here as historical record only.
        </p>
      </section>

      {/* British Home Championship table */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">British Home Championship (1884–1984)</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--text-muted)] uppercase tracking-wider" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <th className="px-3 py-2 w-16">Year</th>
                <th className="px-3 py-2">1st</th>
                <th className="px-3 py-2">2nd</th>
                <th className="px-3 py-2">3rd</th>
                <th className="px-3 py-2">4th</th>
              </tr>
            </thead>
            <tbody>
              {[...bhc].reverse().map((e, i) => (
                <tr
                  key={e.year}
                  className="border-b text-sm"
                  style={{
                    borderColor: "var(--border)",
                    background: i % 2 === 0 ? "var(--bg-card)" : "transparent",
                  }}
                >
                  <td className="px-3 py-1.5 tabular-nums font-medium">{e.year}</td>
                  <td className="px-3 py-1.5"><TeamCell slugs={e.first} /></td>
                  <td className="px-3 py-1.5"><TeamCell slugs={e.second} /></td>
                  <td className="px-3 py-1.5"><TeamCell slugs={e.third} /></td>
                  <td className="px-3 py-1.5"><TeamCell slugs={e.fourth} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rous Cup table */}
      {rous.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">Rous Cup (1985–1989)</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Small invitational replacing the BHC. England and Scotland were joined by rotating guests.
          </p>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[var(--text-muted)] uppercase tracking-wider" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 w-16">Year</th>
                  <th className="px-3 py-2">1st</th>
                  <th className="px-3 py-2">2nd</th>
                  <th className="px-3 py-2">3rd</th>
                </tr>
              </thead>
              <tbody>
                {[...rous].reverse().map((e, i) => (
                  <tr
                    key={e.year}
                    className="border-b text-sm"
                    style={{
                      borderColor: "var(--border)",
                      background: i % 2 === 0 ? "var(--bg-card)" : "transparent",
                    }}
                  >
                    <td className="px-3 py-1.5 tabular-nums font-medium">{e.year}</td>
                    <td className="px-3 py-1.5"><TeamCell slugs={e.first} /></td>
                    <td className="px-3 py-1.5"><TeamCell slugs={e.second} /></td>
                    <td className="px-3 py-1.5"><TeamCell slugs={e.third} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
