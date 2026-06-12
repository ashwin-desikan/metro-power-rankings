import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllBaseballSlugs,
  getBaseballTeamBySlug,
  getBaseballTeamDetail,
  getCountrySlugForBaseballTeam,
} from "@/lib/baseball";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllBaseballSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = getBaseballTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/baseball/${slug}`;
  const desc = `${team.name} at the World Baseball Classic: every campaign and game since 2006, all-time record, and finals history.`;
  return {
    title: `${team.name} — International Baseball`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ ...card, fontFamily: "'JetBrains Mono', monospace" }}>
      {children}
    </span>
  );
}

export default async function BaseballTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = getBaseballTeamBySlug(slug);
  const detail = getBaseballTeamDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForBaseballTeam(team);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/baseball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Baseball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/baseball" className="hover:underline">International Baseball</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
          {team.titles > 0 ? (
            <Chip>WBC Champions {team.title_years.join(", ")}</Chip>
          ) : null}
        </div>
        <div className="mt-2 text-sm text-[var(--text-muted)] tabular-nums" style={mono}>
          {team.apps} World Baseball Classic{team.apps === 1 ? "" : "s"} · {team.w}–{team.l} ·{" "}
          {team.first}–{team.last}
        </div>
        {countrySlug ? (
          <div className="mt-2 text-xs">
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          </div>
        ) : null}
      </header>

      {/* ---------------- Record ---------------- */}
      <section className="mb-10">
        <div className="rounded-xl border p-4 max-w-md" style={card}>
          <div className="font-semibold mb-2">All-time WBC record</div>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <span className="text-[var(--text-muted)]">Appearances</span>
            <span className="text-right tabular-nums" style={mono}>{team.apps}</span>
            <span className="text-[var(--text-muted)]">Won / Lost</span>
            <span className="text-right tabular-nums" style={mono}>{team.w}–{team.l}</span>
            <span className="text-[var(--text-muted)]">Runs for / against</span>
            <span className="text-right tabular-nums" style={mono}>{team.rf} / {team.ra}</span>
            <span className="text-[var(--text-muted)]">Best finish</span>
            <span className="text-right">{team.best_finish ?? "—"}</span>
            {team.runner_ups > 0 ? (
              <>
                <span className="text-[var(--text-muted)]">Finals lost</span>
                <span className="text-right tabular-nums" style={mono}>
                  {team.runner_ups} ({team.ru_years.join(", ")})
                </span>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------------- Campaigns ---------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Tournament by tournament</h2>
        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Finish</th>
                <th className="py-2 px-3 text-right font-medium">W</th>
                <th className="py-2 px-3 text-right font-medium">L</th>
              </tr>
            </thead>
            <tbody>
              {detail.campaigns.map((c) => (
                <tr key={c.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{c.year}</td>
                  <td className="py-2 px-3">
                    <span className={c.finish === "Champions" ? "font-semibold" : ""}
                          style={c.finish === "Champions" ? { color: "#d4af37" } : undefined}>
                      {c.finish}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{c.w}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={mono}>{c.l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Games ---------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Every WBC game</h2>
        <div className="rounded-xl border overflow-x-auto max-h-[520px] overflow-y-auto" style={card}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Round</th>
                <th className="py-2 px-3 font-medium">Opponent</th>
                <th className="py-2 px-3 font-medium">Result</th>
                <th className="py-2 px-3 font-medium">Venue</th>
              </tr>
            </thead>
            <tbody>
              {detail.games.slice().reverse().map((g, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>{g.year}</td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">
                    {g.round}{g.pool ? ` · ${g.pool}` : ""}
                  </td>
                  <td className="py-1.5 px-3">{g.opp}</td>
                  <td className="py-1.5 px-3 tabular-nums" style={mono}>
                    <span className={g.result === "W" ? "font-semibold" : "text-[var(--text-muted)]"}>
                      {g.result} {g.score}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{g.venue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-[var(--text-dim)]">
        World Baseball Classic finals tournaments only; qualifiers out of scope. See the{" "}
        <Link href="/teams/baseball#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
