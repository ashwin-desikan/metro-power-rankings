import type { Metadata } from "next";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllBasketballSlugs,
  getBasketballNationBySlug,
  getBasketballNationDetail,
  getCountrySlugForBasketballNation,
} from "@/lib/basketball";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList } from "@/app/_shared/Disclosure";

// dynamicParams=true since 2026-08-07: this portal's data is now read at runtime
// (lib/liveData), so the weekly refresh can introduce a nation between builds.
// With dynamicParams=false that nation 404'd until someone happened to deploy.
// Unknown slugs now render on first request, same posture as /rankings/[slug],
// /states/[slug], /teams/cfb/[slug] and the rest. Safe on origin load because
// the Cloudflare rate-limit rule went in the same day.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllBasketballSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = await getBasketballNationBySlug(slug);
  if (!team) return {};
  const path = `/teams/basketball/${slug}`;
  const desc = `${team.name} in international basketball: FIBA World Cup campaigns, Olympic medals, and finals history.`;
  return {
    title: `${team.name}: International Basketball`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default async function BasketballNationPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = await getBasketballNationBySlug(slug);
  const detail = await getBasketballNationDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForBasketballNation(team);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/basketball"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Basketball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/basketball" className="hover:underline">International Basketball</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
        <ChampionBadge items={getCurrentChampionships(team.name, "Basketball")} />
          {team.fiba_rank ? (
            <Link
              href="/teams/basketball#fiba-ranking"
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:border-[var(--accent)] transition"
              style={card}
              title={`FIBA World Ranking, as of the latest release`}
            >
              <span className="font-semibold">FIBA #{team.fiba_rank}</span>
              <span className="text-[var(--text-muted)] tabular-nums" style={mono}>{team.fiba_pts?.toFixed(1)} pts</span>
              {team.fiba_zone ? (
                <span className="text-[var(--text-dim)]">{team.fiba_zone} #{team.fiba_zone_rank}</span>
              ) : null}
              {typeof team.fiba_delta === "number" && team.fiba_delta !== 0 ? (
                <span style={{ color: team.fiba_delta > 0 ? "#16a34a" : "#dc2626" }}>
                  {team.fiba_delta > 0 ? `▲${team.fiba_delta}` : `▼${Math.abs(team.fiba_delta)}`}
                </span>
              ) : null}
            </Link>
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

      {/* ---------------- Honours ---------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">Olympics</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                {team.gold}{team.gold_years.length > 0 ? ` (${team.gold_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>{team.silver}</span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>{team.bronze}</span>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={card}>
            <div className="font-semibold mb-2">FIBA World Cup</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-[var(--text-muted)]">Titles</span>
              <span className="text-right tabular-nums font-semibold" style={mono}>
                {team.wc_titles}{team.wc_title_years.length > 0 ? ` (${team.wc_title_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Finals lost</span>
              <span className="text-right tabular-nums" style={mono}>
                {team.wc_ru}{team.wc_ru_years.length > 0 ? ` (${team.wc_ru_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Editions on file</span>
              <span className="text-right tabular-nums" style={mono}>{team.wc_apps}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- WC campaigns ---------------- */}
      {detail.campaigns.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-1">World Cup campaigns</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Editions on file only; W–L across all games played.
          </p>
          {/* Mobile: one card per campaign year instead of a scroll-only table */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="campaigns"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={detail.campaigns.map((c) => (
              <div key={c.year} className="rounded-lg border p-3" style={card}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm tabular-nums" style={mono}>{c.year}</span>
                  <div>
                    {c.finish ? (
                      <span className={c.finish === "Champions" ? "font-semibold text-sm" : "text-sm"}
                            style={c.finish === "Champions" ? { color: GOLD } : undefined}>
                        {c.finish}
                      </span>
                    ) : <span className="text-sm text-[var(--text-dim)]">—</span>}
                  </div>
                </div>
                {c.as ? <div className="text-xs text-[var(--text-dim)] mt-0.5">as {c.as}</div> : null}
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W</div>
                    <div className="tabular-nums" style={mono}>{c.w}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">L</div>
                    <div className="tabular-nums" style={mono}>{c.l}</div>
                  </div>
                </div>
              </div>
            ))}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 text-right font-medium">W</th>
                  <th className="py-2 px-3 text-right font-medium">L</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {detail.campaigns.map((c) => (
                  <tr key={c.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{c.year}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{c.w}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={mono}>{c.l}</td>
                    <td className="py-2 px-3">
                      {c.finish ? (
                        <span className={c.finish === "Champions" ? "font-semibold" : ""}
                              style={c.finish === "Champions" ? { color: GOLD } : undefined}>
                          {c.finish}
                        </span>
                      ) : <span className="text-[var(--text-dim)]">—</span>}
                      {c.as ? <span className="text-xs text-[var(--text-dim)]"> · as {c.as}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-[var(--text-dim)]">
        World Cup data covers the editions on file; Olympic medals cover all 21
        tournaments. See the{" "}
        <Link href="/teams/basketball#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
