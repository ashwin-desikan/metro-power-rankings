import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllVolleyballSlugs,
  getVolleyballTeamBySlug,
  getVolleyballTeamDetail,
  getCountrySlugForVolleyballTeam,
} from "@/lib/volleyball";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllVolleyballSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = getVolleyballTeamBySlug(slug);
  if (!team) return {};
  const path = `/teams/volleyball/${slug}`;
  const desc = `${team.name} in international volleyball: Olympic medals and FIVB World Championship record.`;
  return {
    title: `${team.name} — International Volleyball`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default async function VolleyballTeamPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = getVolleyballTeamBySlug(slug);
  const detail = getVolleyballTeamDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForVolleyballTeam(team);
  const flag = flagCdnUrl(team.slug, "40x30");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/volleyball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span>
          Back to International Volleyball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/volleyball" className="hover:underline">International Volleyball</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flag && <img src={flag} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
        <ChampionBadge items={getCurrentChampionships(team.name, "Volleyball")} />
          {team.oly_alltime_rank != null ? (
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={card}
                  title="Rank in the all-time Olympic volleyball medal table">
              <span className="font-semibold">Olympic #{team.oly_alltime_rank}</span>
              <span className="text-[var(--text-dim)]">{team.oly_medals} medals</span>
            </span>
          ) : null}
        </div>
        {team.lineage ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Includes the {team.lineage.join(", ")} era{team.lineage.length > 1 ? "s" : ""}.
          </p>
        ) : null}
        {countrySlug ? (
          <div className="mt-2 text-xs">
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          </div>
        ) : null}
      </header>

      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Olympics</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                {team.oly_gold}{team.oly_gold_years.length > 0 ? ` (${team.oly_gold_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.oly_silver}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.oly_bronze}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">FIVB World Championship</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                {team.worlds_gold}{team.worlds_gold_years.length > 0 ? ` (${team.worlds_gold_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.worlds_silver}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.worlds_bronze}</span>
            </div>
          </div>
        </div>
      </section>

      {detail.oly.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Olympic medals</h2>

          {/* Mobile: one card per medal instead of a table, for consistency
              with every other table on the site. Same `detail.oly` rows. */}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="medal tables"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid gap-2 p-2 pt-0"
              items={detail.oly.map((m) => (
              <div key={`${m.year}-${m.medal}-card`} className="rounded-lg border p-3 flex items-center justify-between gap-2" style={card}>
                <span className="tabular-nums text-sm" style={mono}>{m.year}</span>
                <span className="font-medium text-sm" style={{ color: m.medal === "Gold" ? GOLD : undefined }}>{m.medal}</span>
              </div>
            ))}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Medal</th>
                </tr>
              </thead>
              <tbody>
                {detail.oly.map((m) => (
                  <tr key={`${m.year}-${m.medal}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{m.year}</td>
                    <td className="py-2 px-3 font-medium" style={{ color: m.medal === "Gold" ? GOLD : undefined }}>{m.medal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-dim)]">
        Olympic gold is the headline honour. See the{" "}
        <Link href="/teams/volleyball#methodology" className="underline hover:text-[var(--accent)]">methodology</Link>{" "}
        on the hub. {team.worlds_medals > 0 ? `${team.worlds_medals} FIVB World Championship medals in all.` : ""}
      </p>
    </main>
  );
}
