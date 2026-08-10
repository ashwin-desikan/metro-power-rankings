import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { getWnbaMeta, getAllFranchises, getDefunctFranchises, getChampions, getLatestStandings, type WnbaFranchise } from "@/lib/wnba";
import { getCurrentWnbaStandings } from "@/lib/wnba-standings";
import { getSeasonSim, simIsCurrent, simByName, fmtOdds } from "@/lib/seasonSim";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import WnbaFranchiseTable from "./WnbaFranchiseTable";

export const dynamicParams = false;
const PAGE_PATH = "/teams/wnba";
const PAGE_TITLE = "WNBA";
const PAGE_DESCRIPTION =
  "Every WNBA franchise, current and defunct, ranked by championships, with all-time records, the live current-season standings, champions since 1997, and per-team pages.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function Mono({ abbr, color }: { abbr: string; color: string }) {
  return <span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0" style={{ background: color, color: "#fff", width: 26, height: 16, fontSize: abbr.length > 3 ? 7 : 9 }} aria-hidden>{abbr}</span>;
}

type Row = { slug: string | null; team: string; abbr: string | null; color: string | null; w: number; l: number; win_pct: number | null; champion?: boolean; finals?: boolean; espnName?: string; po?: boolean; cut?: boolean };
const confLabel = (c: string) => (/^e/i.test(c) ? "Eastern Conference" : /^w/i.test(c) ? "Western Conference" : c || "League");
const fmtPct = (p: number | null) => (p != null ? p.toFixed(3).replace(/^0/, "") : "—");

export default async function WnbaPage() {
  const meta = getWnbaMeta();
  const franchises = getAllFranchises();
  const defunct = getDefunctFranchises();
  const champions = getChampions();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const reigning = champions[0];

  // Live current-season standings from ESPN; fall back to the workbook's last
  // completed season if the API is unreachable or still on the prior season.
  const [live, sim] = await Promise.all([getCurrentWnbaStandings(), getSeasonSim("wnba")]);
  const liveActive = live.rows.length > 0 && live.season_year > meta.latest_season;
  // Playoff odds from our own Monte Carlo (scripts/predictions/
  // build_season_sims.py, refreshed daily); columns appear only while the
  // season is live and the sim is current, the /teams/mlb convention.
  const showOdds = liveActive && simIsCurrent(sim);
  const simRows = simByName(sim);
  // The WNBA seeds its playoff field 1-8 on overall record, conference-blind,
  // so the current field is the best eight records across BOTH conferences.
  const field = new Set(
    live.rows.slice().sort((a, b) => b.win_pct - a.win_pct || b.wins - a.wins).slice(0, 8).map((r) => r.name),
  );
  const asOf = new Date(live.fetched_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const nameToFr = new Map<string, WnbaFranchise>();
  for (const f of franchises) {
    nameToFr.set(f.name.toLowerCase(), f);
    for (const a of f.aka) nameToFr.set(a.toLowerCase(), f);
  }

  let groups: { conference: string; rows: Row[] }[];
  let standingsLabel: string;
  if (liveActive) {
    const byConf = new Map<string, Row[]>();
    for (const r of live.rows) {
      const f = nameToFr.get(r.name.toLowerCase()) ?? null;
      const key = r.conf || "League";
      if (!byConf.has(key)) byConf.set(key, []);
      byConf.get(key)!.push({ slug: f?.slug ?? null, team: f?.name ?? r.name, abbr: f?.abbr ?? r.abbr, color: f?.color ?? null, w: r.wins, l: r.losses, win_pct: r.win_pct, espnName: r.name, po: field.has(r.name) });
    }
    groups = [...byConf.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, rows]) => {
      const sorted = rows.sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.w - a.w);
      // Cut line under the last playoff row of a contiguous leading run.
      const lastLead = sorted.findIndex((r) => !r.po) - 1;
      if (lastLead >= 0 && !sorted.slice(lastLead + 1).some((r) => r.po)) sorted[lastLead].cut = true;
      return { conference: confLabel(c), rows: sorted };
    });
    standingsLabel = live.source_label || `${live.season_year} Standings`;
  } else {
    groups = getLatestStandings().map(({ conference, rows }) => ({
      conference: confLabel(conference),
      rows: rows.map((st) => { const f = bySlug.get(st.slug); return { slug: st.slug, team: st.team, abbr: f?.abbr ?? null, color: f?.color ?? null, w: st.w, l: st.l, win_pct: st.win_pct, champion: st.champion, finals: st.finals_app }; }),
    }));
    standingsLabel = `${meta.latest_season} Standings`;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs mb-6 text-[var(--text-muted)]">
        <Link href="/sports" className="hover:text-[var(--accent)] transition-colors">← All Sports</Link>
      </nav>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Basketball · Women&apos;s · United States</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Women&apos;s National Basketball Association</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The premier women&apos;s professional basketball league, founded by the NBA in 1996 and first
          played in 1997. Franchise identity folds relocations and renames into one lineage, so the
          Detroit Shock&apos;s titles sit with the Dallas Wings and Utah Starzz history with the Las
          Vegas Aces. Defunct franchises are listed alongside the active ones below.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{meta.active_count}</strong> current franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{meta.defunct_count}</strong> defunct</div>
          <div><strong className="text-[var(--text)] text-sm">{meta.total_seasons}</strong> seasons ({meta.founded}–{meta.latest_season})</div>
          {reigning && <div>Reigning champion: <strong className="text-[var(--text)] text-sm">{reigning.champion}</strong></div>}
        </div>
      </header>

      <HubNav
        items={[
          { label: "Standings", href: "#standings" },
          { label: "All-Time Franchises", href: "#all-time" },
          { label: "Champions", href: "#champions" },
          { label: "Defunct", href: "#defunct" },
        ]}
      />

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h2 id="standings" className="text-xl font-bold">{standingsLabel}</h2>
          {liveActive && <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold" style={{ background: "rgba(16,185,129,0.16)", color: "#10b981" }}>Live · ESPN</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map(({ conference, rows }) => (
            <div key={conference} className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="px-3 py-2 border-b text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>{conference}</div>

              {/* Mobile: one card per team instead of a scroll-only table */}
              <div className="grid grid-cols-1 gap-2 p-2 sm:hidden">
                {rows.map((st, i) => (
                  <div
                    key={(st.slug ?? st.team) + i + "-card"}
                    className="rounded-lg border p-2.5"
                    style={{
                      borderColor: "var(--border)",
                      background: st.champion ? "rgba(251,191,36,0.07)" : st.po ? "rgba(34,197,94,0.05)" : "var(--bg-card)",
                      ...(st.po ? { borderLeft: "3px solid rgba(34,197,94,0.55)" } : null),
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <TeamCrest name={st.team} size={20} fallback={st.abbr && st.color ? <Mono abbr={st.abbr} color={st.color} /> : null} />
                        {st.slug ? (
                          <Link href={`/teams/wnba/${st.slug}`} className={`hover:text-[var(--accent)] transition-colors truncate ${st.champion ? "font-semibold" : ""}`}>{st.team}</Link>
                        ) : (
                          <span className="truncate">{st.team}</span>
                        )}
                        {st.champion && <span className="text-yellow-400 text-xs flex-shrink-0">★</span>}
                        {st.finals && !st.champion && <span className="text-[var(--text-dim)] text-[10px] flex-shrink-0">F</span>}
                      </span>
                      <span className="flex items-baseline gap-2 text-xs tabular-nums flex-shrink-0">
                        <span>{st.w}-{st.l}</span>
                        <span className="text-[var(--text-muted)]">{fmtPct(st.win_pct)}</span>
                        {showOdds && st.espnName && (
                          <span className="text-[var(--text-muted)]">{fmtOdds(simRows.get(st.espnName)?.p_title)} title</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <table className="w-full text-sm tabular-nums hidden sm:table">
                <thead>
                  <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <th className="text-left py-2 px-3 font-medium">Team</th>
                    <th className="text-right py-2 px-2 font-medium">W</th>
                    <th className="text-right py-2 px-2 font-medium">L</th>
                    <th className="text-right py-2 px-3 font-medium">Win%</th>
                    {showOdds && <th className="text-right py-2 px-2 font-medium">PO%</th>}
                    {showOdds && <th className="text-right py-2 px-3 font-medium">Title%</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((st, i) => (
                    <tr key={(st.slug ?? st.team) + i} className="border-b last:border-b-0"
                      style={{
                        borderColor: "var(--border)",
                        background: st.champion ? "rgba(251,191,36,0.07)" : st.po ? "rgba(34,197,94,0.06)" : undefined,
                        ...(st.cut ? { boxShadow: "inset 0 -2px 0 rgba(34,197,94,0.45)" } : null),
                      }}>
                      <td className="py-2 px-3">
                        <span className="flex items-center gap-2">
                          <TeamCrest name={st.team} size={20} fallback={st.abbr && st.color ? <Mono abbr={st.abbr} color={st.color} /> : null} />
                          {st.slug ? (
                            <Link href={`/teams/wnba/${st.slug}`} className={`hover:text-[var(--accent)] transition-colors ${st.champion ? "font-semibold" : ""}`}>{st.team}</Link>
                          ) : (
                            <span>{st.team}</span>
                          )}
                          {st.champion && <span className="text-yellow-400 text-xs">★</span>}
                          {st.finals && !st.champion && <span className="text-[var(--text-dim)] text-[10px]">F</span>}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{st.w}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{st.l}</td>
                      <td className="py-2 px-3 text-right">{fmtPct(st.win_pct)}</td>
                      {showOdds && <td className="py-2 px-2 text-right">{fmtOdds(st.espnName ? simRows.get(st.espnName)?.p_playoffs : null)}</td>}
                      {showOdds && <td className="py-2 px-3 text-right">{fmtOdds(st.espnName ? simRows.get(st.espnName)?.p_title : null)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-dim)] mt-2">
          {liveActive ? (
            <>Current as of {asOf}, via ESPN (refreshed hourly). Green-shaded teams hold one of the eight playoff spots, seeded on overall record across both conferences.
            {showOdds && sim && <> Playoff and title odds are our own simulation of the remaining schedule ({sim.meta.sims.toLocaleString()} runs, updated {sim.meta.generated_at}).</>}</>
          ) : <>★ Champion · F Finalist · {meta.latest_season} final standings</>}
        </p>
      </section>

      <section className="mb-10">
        <h2 id="all-time" className="text-xl font-bold mb-1">All-Time Franchises</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Current and defunct franchises, sorted by championships. Click any column to sort.</p>
        <WnbaFranchiseTable franchises={franchises} />
      </section>

      <section className="mb-10">
        <h2 id="champions" className="text-xl font-bold mb-4">Champions</h2>

        {/* Mobile: one card per title year */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {champions.map((h) => {
            const cf = bySlug.get(h.champion_slug);
            return (
              <div key={h.year + "-card"} className="rounded-lg border p-2.5 flex items-center gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <span className="font-bold tabular-nums w-12 flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{h.year}</span>
                <TeamCrest name={h.champion} size={20} fallback={cf ? <Mono abbr={cf.abbr} color={cf.color} /> : null} />
                <Link href={`/teams/wnba/${h.champion_slug}`} className="font-medium hover:text-[var(--accent)] transition-colors truncate">{h.champion}</Link>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="text-left py-2 px-4 font-medium">Year</th>
                <th className="text-left py-2 px-3 font-medium">Champion</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((h) => {
                const cf = bySlug.get(h.champion_slug);
                return (
                  <tr key={h.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 px-4 font-medium">{h.year}</td>
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-2">
                        <TeamCrest name={h.champion} size={20} fallback={cf ? <Mono abbr={cf.abbr} color={cf.color} /> : null} />
                        <Link href={`/teams/wnba/${h.champion_slug}`} className="font-medium hover:text-[var(--accent)] transition-colors">{h.champion}</Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {defunct.length > 0 && (
        <section className="mb-6">
          <h2 id="defunct" className="text-sm font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wider">Defunct Franchises</h2>
          <div className="flex flex-wrap gap-2">
            {defunct.map((f) => (
              <Link key={f.slug} href={`/teams/wnba/${f.slug}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-dim)", background: "var(--bg-card)" }}>
                <span className="inline-block rounded-sm w-2 h-2 flex-shrink-0" style={{ background: f.color }} />
                {f.name}
                {f.titles > 0 && <span className="text-yellow-500 ml-0.5">({f.title_years.join(", ")})</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-6">Seasons {meta.founded}–{meta.latest_season}. Records via WNBA official; live standings via ESPN.</p>
    </main>
  );
}
