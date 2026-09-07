import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllWBasketballSlugs,
  getCountrySlugForWBasketballNation,
  getWBasketballNationBySlug,
  getWBasketballNationDetail,
  getWFibaRanking,
} from "@/lib/wbasketball";
import { getBasketballNationBySlug } from "@/lib/basketball";
import { flagCdnUrl } from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";

// Same posture as the men's nation pages: the data is read at runtime, so a
// nation introduced between builds renders on first request instead of 404ing
// until someone happens to deploy.
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllWBasketballSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const team = await getWBasketballNationBySlug(slug);
  if (!team) return {};
  const path = `/teams/basketball/women/${slug}`;
  const desc = `${team.name} in women's international basketball: World Cup final fours, Olympic medals and the current FIBA ranking.`;
  return {
    title: `${team.name}: Women's International Basketball`,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${team.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${team.name} | ${SITE_NAME}`, description: desc },
  };
}

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";
const MEDAL_LABEL: Record<string, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

export default async function WBasketballNationPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const team = await getWBasketballNationBySlug(slug);
  const detail = await getWBasketballNationDetail(slug);
  if (!team || !detail) notFound();

  const countrySlug = getCountrySlugForWBasketballNation(team);
  const fiba = await getWFibaRanking();
  // Only offer the men's link where that nation actually has a men's page.
  const mensTeam = await getBasketballNationBySlug(slug);
  const stamp = [
    `As of ${fiba ? fiba.label : "the latest release"}`,
    `${detail.campaigns.length} World Cup final fours`,
    `${team.medals} Olympic medals`,
    "Wikipedia + FIBA",
  ].join("  ·  ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/basketball/women"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to Women&apos;s International Basketball
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/basketball" className="hover:underline">International Basketball</Link>
        {" / "}
        <Link href="/teams/basketball/women" className="hover:underline">Women</Link>
        {" / "}
        <span>{team.name}</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" loading="lazy" decoding="async" />
          )}
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{team.name}</h1>
          {team.fiba_rank ? (
            <Link
              href="/teams/basketball/women#fiba-ranking"
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:border-[var(--accent)] transition"
              style={card}
              title="FIBA Women's World Ranking, as of the latest release"
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
        <p className="mt-3 text-[10px] uppercase tracking-widest" style={{ ...mono, color: "var(--text-dim)" }}>
          {stamp}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {countrySlug ? (
            <Link href={`/countries/${countrySlug}`} className="underline hover:text-[var(--accent)]">
              Country profile →
            </Link>
          ) : null}
          {mensTeam ? (
            <Link href={`/teams/basketball/${team.slug}`} className="underline hover:text-[var(--accent)]">
              Men&apos;s team →
            </Link>
          ) : null}
        </div>
      </header>

      {/* ---------------- Honours ---------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-4 min-w-0" style={card}>
            <div className="font-semibold mb-2">Olympics</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span style={{ color: GOLD }}>Gold</span>
              <span className="text-right tabular-nums font-semibold" style={{ ...mono, color: GOLD }}>
                {team.gold}{team.gold_years.length > 0 ? ` (${team.gold_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Silver</span>
              <span className="text-right tabular-nums" style={mono}>
                {team.silver}{team.silver_years.length > 0 ? ` (${team.silver_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Bronze</span>
              <span className="text-right tabular-nums" style={mono}>
                {team.bronze}{team.bronze_years.length > 0 ? ` (${team.bronze_years.join(", ")})` : ""}
              </span>
            </div>
          </div>
          <div className="rounded-xl border p-4 min-w-0" style={card}>
            <div className="font-semibold mb-2">FIBA Women&apos;s World Cup</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-[var(--text-muted)]">Titles</span>
              <span className="text-right tabular-nums font-semibold" style={mono}>
                {team.wc_titles}{team.wc_title_years.length > 0 ? ` (${team.wc_title_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Finals lost</span>
              <span className="text-right tabular-nums" style={mono}>
                {team.wc_ru}{team.wc_ru_years.length > 0 ? ` (${team.wc_ru_years.join(", ")})` : ""}
              </span>
              <span className="text-[var(--text-muted)]">Final fours</span>
              <span className="text-right tabular-nums" style={mono}>{team.wc_final_fours}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- World Cup final fours ---------------- */}
      {detail.campaigns.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-1">World Cup final fours</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
            The source lists each edition&apos;s final four only, so this is finishes, not campaigns.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={8}
              noun="finishes"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={detail.campaigns.map((c) => (
                <div key={c.year} className="rounded-lg border p-3" style={card}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm tabular-nums" style={mono}>{c.year}</span>
                    <span className={c.finish === "Champions" ? "font-semibold text-sm" : "text-sm"}
                          style={c.finish === "Champions" ? { color: GOLD } : undefined}>
                      {c.finish}
                    </span>
                  </div>
                  {c.as ? <div className="text-xs text-[var(--text-dim)] mt-0.5">as {c.as}</div> : null}
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Score</div>
                      <div className="tabular-nums" style={mono}>{c.score}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Opponent</div>
                      <div>{c.opponent}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Host</div>
                      <div>{c.host}</div>
                    </div>
                  </div>
                </div>
              ))}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={card}>
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Year</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                  <th className="py-2 px-3 font-medium">Score</th>
                  <th className="py-2 px-3 font-medium">Opponent</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Host</th>
                </tr>
              </thead>
              <tbody>
                {detail.campaigns.map((c) => (
                  <tr key={c.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{c.year}</td>
                    <td className="py-2 px-3">
                      <span className={c.finish === "Champions" ? "font-semibold" : ""}
                            style={c.finish === "Champions" ? { color: GOLD } : undefined}>
                        {c.finish}
                      </span>
                      {c.as ? <span className="text-xs text-[var(--text-dim)]"> · as {c.as}</span> : null}
                    </td>
                    <td className="py-2 px-3 tabular-nums" style={mono}>{c.score}</td>
                    <td className="py-2 px-3">{c.opponent}</td>
                    <td className="py-2 px-3 text-xs text-[var(--text-muted)] hidden sm:table-cell">{c.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---------------- Olympic medals ---------------- */}
      {detail.olympics.length > 0 ? (
        <Disclosure title="Olympic medals" meta={`${detail.olympics.length}`} className="mb-10">
          <ul className="p-4 space-y-1.5 text-sm">
            {detail.olympics.map((o) => (
              <li key={`${o.year}-${o.medal}`} className="flex items-center justify-between gap-3">
                <span>
                  <span className="tabular-nums" style={mono}>{o.year}</span>
                  <span className="text-[var(--text-muted)]"> {o.host ?? ""}</span>
                  {o.as ? <span className="text-xs text-[var(--text-dim)]"> · as {o.as}</span> : null}
                </span>
                <span className="font-medium" style={o.medal === "gold" ? { color: GOLD } : undefined}>
                  {MEDAL_LABEL[o.medal] ?? o.medal}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      <p className="text-xs text-[var(--text-dim)]">
        World Cup data is the final four of each edition, 1953 to the latest
        played; Olympic medals cover all women&apos;s tournaments since 1976. See the{" "}
        <Link href="/teams/basketball/women#methodology" className="underline hover:text-[var(--accent)]">
          methodology
        </Link>{" "}
        on the hub.
      </p>
    </main>
  );
}
