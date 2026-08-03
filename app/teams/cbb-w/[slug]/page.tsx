import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllWcbbTeams, getWcbbTeamBySlug, getWcbbTournament, wcbbMonogram, type WcbbTourYear } from "@/lib/wcbb";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import { getRivalries } from "@/lib/rivalries";

// Pre-generate only current D1 programs (363 of 384 total). Historical/
// non-D1 programs are still reachable: dynamicParams=true renders them on
// first request and the long revalidate caches the result, same pattern as
// app/states/[slug]/page.tsx.
export const dynamicParams = true;
export const revalidate = 31536000; // 1 year — effectively static
export function generateStaticParams() {
  return getAllWcbbTeams().filter((t) => t.current_d1).sort((a, b) => (b.w ?? 0) - (a.w ?? 0)).slice(0, 120).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getWcbbTeamBySlug(slug);
  if (!t) return {};
  const path = `/teams/cbb-w/${slug}`;
  const desc = `${t.name} women's basketball: ${t.titles} national title${t.titles === 1 ? "" : "s"}, ${t.final4} Final Four${t.final4 === 1 ? "" : "s"} and ${t.tour_app} NCAA tournament appearance${t.tour_app === 1 ? "" : "s"}.`;
  return {
    title: `${t.name} Women's Basketball`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${t.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${t.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

function finish(t: WcbbTourYear): string {
  if (t.champ) return "Champion";
  if (t.champ_app) return "Runner-up";
  if (t.final4) return "Final Four";
  if (t.elite8) return "Elite Eight";
  if (t.sweet16) return "Sweet 16";
  return t.w > 0 ? `${t.w} win${t.w === 1 ? "" : "s"}` : "First round";
}

export default async function WcbbTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getWcbbTeamBySlug(slug);
  if (!t) notFound();
  const tour = getWcbbTournament(slug);

  const Stat = ({ label, value, gold }: { label: string; value: string | number; gold?: boolean }) => (
    <div className="rounded-lg border px-3 py-2" style={card}>
      <div className="text-xl font-semibold tabular-nums" style={{ ...mono, color: gold ? GOLD : "var(--text)" }}>{value}</div>
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>{" / "}
        <Link href="/teams/cbb-w" className="hover:underline">Women's College Basketball</Link>{" / "}
        <span>{t.name}</span>
      </nav>

      <header className="mb-6 flex items-center gap-3">
        <span className="rounded-md grid place-items-center font-bold text-white text-sm flex-shrink-0" style={{ background: t.color, width: 40, height: 40 }} aria-hidden>
          {wcbbMonogram(t.name)}
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.name}</h1>
        <ChampionBadge items={getCurrentChampionships(t.name, "W Basketball")} />
          <p className="text-sm text-[var(--text-muted)]">
            Women's College Basketball{t.conference ? ` · ${t.conference}` : ""}
            {t.metro && t.metro_slug ? (<>{" · "}<Link href={`/rankings/${t.metro_slug}`} className="underline hover:text-[var(--accent)]">{t.metro} metro</Link></>) : null}
          </p>
        </div>
      </header>

      <RivalriesSection rivals={getRivalries(t.name, "Women's Basketball", "WCBB")} />

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="National titles" value={t.titles} gold />
        <Stat label="Final Fours" value={t.final4} />
        <Stat label="Tournament apps" value={t.tour_app} />
        <Stat label="Elite Eights" value={t.elite8} />
        <Stat label="Sweet 16s" value={t.sweet16} />
        <Stat label="All-time record" value={`${t.w}-${t.l}`} />
        <Stat label="Win pct" value={t.pct.toFixed(3)} />
        <Stat label="Weeks at AP #1" value={t.weeks_at_1} />
      </section>

      {t.title_years.length > 0 && (
        <p className="text-sm mb-8">
          <span className="font-semibold" style={{ color: GOLD }}>National championships:</span>{" "}
          <span style={mono}>{t.title_years.join(", ")}</span>
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">NCAA tournament history</h2>
        {tour.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No NCAA tournament appearances on record.</p>
        ) : (
          <>
            {/* Mobile: one card per tournament year. Same `tour` data as the
                desktop table. */}
            <div className="grid grid-cols-1 gap-2 sm:hidden">
              {tour.map((y) => (
                <div key={`${y.year}-card`} className="rounded-lg border p-3" style={card}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums" style={mono}>{y.year}</span>
                    <span className="text-xs" style={{ color: y.champ ? GOLD : "var(--text-muted)" }}>{finish(y)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                    <span className="text-[var(--text-muted)]">Seed {y.seed ?? "—"}</span>
                    <span className="text-[var(--text-muted)]">{y.w}-{y.l}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto hidden sm:block" style={card}>
              <table className="w-full text-sm min-w-[420px]">
                <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 px-3 font-medium">Year</th>
                    <th className="py-2 px-3 text-right font-medium">Seed</th>
                    <th className="py-2 px-3 text-right font-medium">W-L</th>
                    <th className="py-2 px-3 font-medium">Finish</th>
                  </tr>
                </thead>
                <tbody>
                  {tour.map((y) => (
                    <tr key={y.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 px-3 tabular-nums font-medium" style={mono}>{y.year}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{y.seed ?? ""}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{y.w}-{y.l}</td>
                      <td className="py-1.5 px-3 text-xs" style={{ color: y.champ ? GOLD : "var(--text-muted)" }}>{finish(y)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="mt-8 text-sm">
        <Link href="/teams/cbb-w" className="underline hover:text-[var(--accent)]">{"←"} All women's basketball programs</Link>
      </div>
    </main>
  );
}
