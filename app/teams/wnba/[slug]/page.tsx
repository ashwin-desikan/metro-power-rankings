import type { Metadata } from "next";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { getCurrentChampionships } from "@/lib/champions";
import { getRivalries } from "@/lib/rivalries";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllFranchiseSlugs, getFranchiseBySlug, getFranchiseSeasons, getWnbaFranchiseByTeamName, type WnbaFranchise, type WnbaSeason } from "@/lib/wnba";
import { getCurrentWnbaStandings } from "@/lib/wnba-standings";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import TopTeamChip from "@/app/teams/TopTeamChip";
import { CappedList } from "@/app/_shared/Disclosure";

export const dynamicParams = false;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllFranchiseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) return { title: "Franchise not found" };
  const desc = `${f.name}: ${f.titles} WNBA title${f.titles === 1 ? "" : "s"}, ${f.finals} finals, ${f.playoff_appearances} playoff appearances` + (f.city ? `, based in ${f.city}.` : ".");
  return {
    title: `${f.name} — WNBA`,
    description: desc,
    alternates: { canonical: `/teams/wnba/${f.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${f.name} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}/teams/wnba/${f.slug}`, type: "website" },
  };
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border text-center min-w-[72px]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</span>
    </div>
  );
}

const FINISH: Record<string, { label: string; bg: string; color: string; border: string }> = {
  "Champion":        { label: "★ Champion", bg: "rgba(251,191,36,0.12)", color: "#F59E0B", border: "rgba(251,191,36,0.3)" },
  "Runner-up":       { label: "Finals",     bg: "var(--bg-card)", color: "var(--text-muted)", border: "var(--border)" },
  "Semifinals":      { label: "Semifinals", bg: "rgba(99,102,241,0.1)", color: "#818CF8", border: "rgba(99,102,241,0.25)" },
  "Playoffs":        { label: "Playoffs",   bg: "transparent", color: "var(--text-dim)", border: "var(--border)" },
  "Missed playoffs": { label: "—",          bg: "transparent", color: "var(--text-dim)", border: "transparent" },
};

function FinishChip({ finish }: { finish: string }) {
  const c = FINISH[finish] ?? FINISH["Missed playoffs"];
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border whitespace-nowrap" style={{ background: c.bg, color: c.color, borderColor: c.border }}>{c.label}</span>;
}

function formatAsOf(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const y = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    return y.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return null;
  }
}

export default async function WnbaFranchisePage({ params }: Props) {
  const { slug } = await params;
  const f = getFranchiseBySlug(slug);
  if (!f) notFound();
  const seasons = getFranchiseSeasons(slug);
  const pct = f.win_pct != null ? f.win_pct.toFixed(3).replace(/^0/, "") : "—";
  // Live current-season standings from ESPN (mirrors the MLB team page).
  // Gate: ESPN must return this franchise with games_played > 0 and a
  // season.year equal to the current calendar year, so a finished prior
  // season or a 0-0 preseason roster never surfaces as a live row.
  const liveSnapshot = await getCurrentWnbaStandings();
  const currentYear = new Date().getFullYear();
  const liveRow =
    liveSnapshot.season_year === currentYear
      ? liveSnapshot.rows.find((r) => getWnbaFranchiseByTeamName(r.name)?.slug === slug) ?? null
      : null;
  const liveSeason: (WnbaSeason & { is_live: true }) | null =
    liveRow && liveRow.games_played > 0
      ? {
          year: liveSnapshot.season_year,
          team: f.name,
          canonical: seasons[0]?.canonical ?? "",
          slug,
          conference: liveRow.conf || seasons[0]?.conference || null,
          w: liveRow.wins,
          l: liveRow.losses,
          win_pct: liveRow.win_pct,
          gb: null,
          ps_g: null,
          pf_g: null,
          playoffs: false,
          div_title: false,
          p_wins: 0,
          p_losses: 0,
          sf_app: false,
          finals_app: false,
          champion: false,
          finish: "",
          finish_rank: 0,
          is_live: true,
        }
      : null;
  const asOfDate = formatAsOf(liveSnapshot.fetched_at);
  const displayRows: Array<WnbaSeason & { is_live?: boolean }> = liveSeason
    ? [liveSeason, ...seasons.filter((s) => s.year !== liveSeason.year)]
    : seasons;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs mb-6 text-[var(--text-muted)] flex items-center gap-3 flex-wrap">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">All Sports</Link>
        <span className="text-[var(--text-dim)]">/</span>
        <Link href="/teams/wnba" className="hover:text-[var(--accent)] transition-colors">WNBA</Link>
        <span className="text-[var(--text-dim)]">/</span>
        <span>{f.name}</span>
      </nav>

      <header className="flex items-start gap-4 mb-6 flex-wrap">
        <TeamCrest name={f.name} size={64} fallback={<span className="inline-flex items-center justify-center font-bold rounded-xl flex-shrink-0" style={{ background: f.color, color: "#fff", width: 64, height: 64, fontSize: f.abbr.length > 3 ? 18 : 22, letterSpacing: "0.04em", opacity: f.defunct ? 0.7 : 1 }} aria-hidden>{f.abbr}</span>} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{f.name}</h1>
        <ChampionBadge items={getCurrentChampionships(f.name, "Basketball")} />
            <TopTeamChip names={[f.name]} metro={f.city} />
            {f.defunct && <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1.5 py-0.5" style={{ borderColor: "var(--border)" }}>Defunct</span>}
            {f.seasons === 0 && <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1.5 py-0.5" style={{ borderColor: "var(--border)" }}>Expansion</span>}
          </div>
          <div className="text-sm text-[var(--text-muted)] mt-1">
            {f.metro_slug ? <Link href={`/rankings/${f.metro_slug}`} className="hover:underline">{f.city}</Link> : f.city}
            {f.city && f.state ? ", " : null}{f.state}
            {f.first_season ? <> · {f.first_season}–{f.last_season}</> : <> · Expansion franchise</>}
          </div>
          {f.aka.length > 0 && <div className="text-xs text-[var(--text-dim)] mt-1">Formerly: {f.aka.join(", ")}</div>}
        </div>
      </header>

      <RivalriesSection rivals={getRivalries(f.name, "W Basketball", "WNBA")} />

      <section className="flex flex-wrap gap-2.5 mb-8">
        <StatChip label="Titles" value={f.titles} />
        <StatChip label="Finals" value={f.finals} />
        <StatChip label="Playoffs" value={f.playoff_appearances} />
        <StatChip label="Seasons" value={f.seasons} />
        <StatChip label="Record" value={`${f.w}-${f.l}`} />
        <StatChip label="Win%" value={pct} />
      </section>

      {f.title_years.length > 0 && (
        <p className="text-sm text-[var(--text-muted)] mb-6">
          <span className="text-yellow-400 font-semibold">Champions</span> {f.title_years.join(", ")}
          {f.final_years.filter((y) => !f.title_years.includes(y)).length > 0 && (
            <> · Finals (lost) {f.final_years.filter((y) => !f.title_years.includes(y)).join(", ")}</>
          )}
        </p>
      )}

      {displayRows.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold mb-4">Season by Season</h2>

          {/* Mobile: one card per season instead of a horizontally-scrolling
              table. Same displayRows data as the desktop table below. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="rows"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={displayRows.map((s) => {
              const isLive = (s as { is_live?: boolean }).is_live === true;
              return (
                <div
                  key={`${s.year}${isLive ? "-live" : ""}-card`}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--border)", background: s.champion ? "rgba(251,191,36,0.06)" : isLive ? "rgba(78,205,196,0.06)" : "var(--bg-card)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-base tabular-nums" style={{ fontWeight: isLive ? 600 : undefined }}>{s.year}</span>
                        {s.champion && <span className="text-yellow-400 text-xs">★</span>}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] leading-tight mt-0.5">{s.team}</div>
                      {isLive && asOfDate ? <div className="text-[9px] mt-0.5 text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>as of {asOfDate}</div> : null}
                    </div>
                    <div className="flex-shrink-0">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border whitespace-nowrap" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-card)" }} title="Live record from ESPN, refreshed hourly">
                          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />
                          Live
                        </span>
                      ) : (
                        <FinishChip finish={s.finish} />
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Conf</div>
                      <div className="text-[var(--text-muted)]">{s.conference ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W-L</div>
                      <div>{s.w}-{s.l}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Win%</div>
                      <div>{s.win_pct != null ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            />
          </div>

          <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-4 font-medium">Season</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Conf</th>
                  <th className="text-left py-2 px-3 font-medium">Team</th>
                  <th className="text-right py-2 px-2 font-medium">W</th>
                  <th className="text-right py-2 px-2 font-medium">L</th>
                  <th className="text-right py-2 px-3 font-medium">Win%</th>
                  <th className="text-left py-2 px-3 font-medium">Finish</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((s) => {
                  const isLive = (s as { is_live?: boolean }).is_live === true;
                  return (
                  <tr key={`${s.year}${isLive ? "-live" : ""}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: s.champion ? "rgba(251,191,36,0.06)" : isLive ? "rgba(78,205,196,0.06)" : undefined, fontStyle: isLive ? "italic" : undefined }}>
                    <td className="py-2 px-4 font-medium" style={{ fontWeight: isLive ? 600 : undefined }}>{s.year}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)] hidden sm:table-cell">{s.conference ?? "—"}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)] text-xs">
                      <div className="leading-tight">{s.team}</div>
                      {isLive && asOfDate ? <div className="text-[9px] mt-0.5 not-italic text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>as of {asOfDate}</div> : null}
                    </td>
                    <td className="py-2 px-2 text-right">{s.w}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{s.l}</td>
                    <td className="py-2 px-3 text-right">{s.win_pct != null ? s.win_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                    <td className="py-2 px-3">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border whitespace-nowrap not-italic" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-card)" }} title="Live record from ESPN, refreshed hourly">
                          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />
                          In progress · ESPN
                        </span>
                      ) : (
                        <FinishChip finish={s.finish} />
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {liveSeason ? (
            <p className="text-[10px] mt-3" style={{ color: "var(--text-dim)" }}>
              In-progress {liveSeason.year} row pulled from ESPN public standings{asOfDate ? `, as of ${asOfDate}` : ""}. Refreshed hourly via Next ISR.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No seasons played yet. This franchise is scheduled to debut as a WNBA expansion team.</p>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-8">
        <Link href="/teams/wnba" className="hover:text-[var(--accent)] transition-colors">← All WNBA franchises</Link>
      </p>
    </main>
  );
}
