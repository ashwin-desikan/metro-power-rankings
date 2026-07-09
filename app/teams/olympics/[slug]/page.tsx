import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllOlympicSlugs,
  getOlympicTeamBySlug,
  getOlympicTeamDetail,
  getCountrySlugForOlympicTeam,
} from "@/lib/olympics";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllOlympicSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = getOlympicTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/olympics/${slug}`;
  const desc = `${team.name} at the Olympic Games: all-time medal record, every Summer and Winter campaign${team.lineage ? `, including the ${team.lineage.join(" and ")} era${team.lineage.length > 1 ? "s" : ""}` : ""}.`;
  return {
    title: `${team.name} — Olympics`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ ...card, fontFamily: "'JetBrains Mono', monospace" }}>
      {children}
    </span>
  );
}

export default async function OlympicTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = getOlympicTeamBySlug(slug);
  const detail = getOlympicTeamDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForOlympicTeam(team);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/olympics"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to Olympics
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/olympics" className="hover:underline">Olympics</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
          {team.special ? <Chip>Historical / Special Team</Chip> : null}
          {team.best_rank === 1 ? <Chip>Topped a medal table</Chip> : null}
        </div>
        {team.lineage ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Includes the {team.lineage.join(", ")} era{team.lineage.length > 1 ? "s" : ""}.
          </p>
        ) : null}
        <div className="mt-2 text-sm text-[var(--text-muted)] tabular-nums" style={mono}>
          {team.apps} Games · {team.first}–{team.last}
        </div>
        {countrySlug ? (
          <div className="mt-2 text-xs">
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          </div>
        ) : null}
      </header>

      {/* ---------------- Medal record ---------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">All-time</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                {team.g.toLocaleString()}
              </span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.s.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.b.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Total</span>
              <span className="text-right tabular-nums font-semibold" style={mono}>{team.total.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Best table finish</span>
              <span className="text-right tabular-nums" style={mono}>#{team.best_rank}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Summer{team.summer_apps ? ` · ${team.summer_apps} Games` : ""}</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums" style={{ ...mono, color: GOLD }}>{team.summer.g.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.summer.s.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.summer.b.toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Winter{team.winter_apps ? ` · ${team.winter_apps} Games` : ""}</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums" style={{ ...mono, color: GOLD }}>{team.winter.g.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.winter.s.toLocaleString()}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.winter.b.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Games by Games ---------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Games by Games</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Every appearance with a medal table rank; rows note the name the team
          competed under at the time.
        </p>
        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[600px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Games</th>
                <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>G</th>
                <th className="py-2 px-3 text-right font-medium">S</th>
                <th className="py-2 px-3 text-right font-medium">B</th>
                <th className="py-2 px-3 text-right font-medium">Total</th>
                <th className="py-2 px-3 text-right font-medium">Rank</th>
                <th className="py-2 px-3 font-medium">Competed as</th>
              </tr>
            </thead>
            <tbody>
              {detail.editions.map((e, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <span className="tabular-nums font-medium" style={mono}>{e.year}</span>
                    <span className="text-xs text-[var(--text-muted)]"> {e.season}</span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: e.g > 0 ? GOLD : "var(--text-dim)" }}>{e.g}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{e.s}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{e.b}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{e.total}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                    {e.rank === 1 ? <span style={{ color: GOLD }}>#1</span> : `#${e.rank}`}
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{e.as ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Related teams ---------------- */}
      {detail.related_teams.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Related teams</h2>
          <div className="flex flex-wrap gap-2">
            {detail.related_teams.map((r) => (
              r.slug ? (
                <Link key={r.name} href={`/teams/olympics/${r.slug}`}
                      className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{ ...card, fontFamily: "'JetBrains Mono', monospace" }}>
                  {r.name}
                </Link>
              ) : <span key={r.name}>{r.name}</span>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-dim)]">
        Medal record from the Olympedia historical tables; 1906 Intercalated Games
        counted in totals by editorial choice. See the{" "}
        <Link href="/teams/olympics#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
