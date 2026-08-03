import type { Metadata } from "next";
import Link from "next/link";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { notFound } from "next/navigation";
import {
  getAllRlSlugs,
  getRlNationBySlug,
  getRlNationDetail,
  getCountrySlugForRlNation,
} from "@/lib/rugbyLeagueIntl";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return getAllRlSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getRlNationBySlug(slug);
  if (!t) return { title: "Nation not found" };
  const path = `/teams/rugby-league/${slug}`;
  const desc = `${t.name} at the Rugby League World Cup: ${t.titles} title${t.titles === 1 ? "" : "s"}, ${t.runner_ups} runner-up finish${t.runner_ups === 1 ? "" : "es"}, ${t.semis} other semi-final${t.semis === 1 ? "" : "s"} across ${t.first}-${t.last}.`;
  return {
    title: `${t.name} — Rugby League World Cup`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${t.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${t.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const FINISH_COLOR: Record<string, string> = {
  Champions: "#d4af37",
  "Runners-up": "var(--text)",
  "Semi-finalist": "var(--text-muted)",
};

export default async function RlNationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getRlNationBySlug(slug);
  if (!t) notFound();
  const detail = getRlNationDetail(slug);
  const countrySlug = getCountrySlugForRlNation(t);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/rugby-league"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>←</span> Back to International Rugby League
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href="/teams/rugby-league" className="hover:underline">Rugby League</Link>{" / "}
        <span>{t.name}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            {flagCdnUrl(t.slug) && (
              <img src={flagCdnUrl(t.slug)!} alt="" aria-hidden width={28} height={21} className="inline-block" loading="lazy" decoding="async" />
            )}
            {t.name}
          </h1>
          <ChampionBadge items={getCurrentChampionships(t.name, "Rugby League")} />
          {t.titles > 0 ? (
            <span className="text-[11px] px-2 py-0.5 rounded font-semibold tracking-wide"
                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}>
              {t.titles}× World Cup champions
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Rugby League World Cup · best finish: {t.best_finish}
          {countrySlug ? (
            <>
              {" · "}
              <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">Country profile →</Link>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Titles", value: t.titles, gold: true },
          { label: "Runners-up", value: t.runner_ups },
          { label: "Semi-finals", value: t.semis },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border p-3" style={card}>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{s.label}</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: s.gold && t.titles > 0 ? "#d4af37" : "var(--text)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">World Cup record</h2>

        {/* Mobile: one card per World Cup appearance instead of a cramped
            3-column table. Same `detail.results` array as the desktop table. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {(detail?.results ?? []).map((r) => (
            <div
              key={`${r.year}-card`}
              className="rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3"
              style={card}
            >
              <span className="tabular-nums font-semibold text-sm" style={mono}>{r.year}</span>
              <span
                className="text-sm font-medium text-right"
                style={{ color: FINISH_COLOR[r.finish] ?? "var(--text)" }}
              >
                {r.finish}
              </span>
              <span className="text-xs text-[var(--text-muted)] text-right flex-shrink-0">{r.host}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 px-3 font-medium">Year</th>
                <th className="py-2 px-3 font-medium">Finish</th>
                <th className="py-2 px-3 font-medium">Host</th>
              </tr>
            </thead>
            <tbody>
              {(detail?.results ?? []).map((r) => (
                <tr key={r.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 px-3 tabular-nums" style={mono}>{r.year}</td>
                  <td className="py-2 px-3 font-medium" style={{ color: FINISH_COLOR[r.finish] ?? "var(--text)" }}>{r.finish}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{r.host}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
