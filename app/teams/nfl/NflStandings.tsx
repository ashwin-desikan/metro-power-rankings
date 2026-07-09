// NflStandings — current-season standings widget for the /teams/nfl index.
// Mirrors MlbStandings in position and style. The 8 divisions are anchored on
// the franchise workbook so all 32 teams render even before the season starts
// ("in place"); live records are overlaid from @/lib/standings (ESPN public
// feed, hourly ISR) and applied only when ESPN's season.year matches the
// current calendar year. Pre-season the table shows blank records.

import Link from "next/link";
import { getCurrentNflStandings, type TeamStanding } from "@/lib/standings";
import { getAllFranchises, logoUrlFor, monogramFor, type Franchise } from "@/lib/nfl";

const DIVISION_ORDER = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

function fmtPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toFixed(3).replace(/^0/, "");
}

export default async function NflStandings() {
  const standings = await getCurrentNflStandings();
  const now = new Date();
  const currentYear = now.getFullYear();
  // The NFL season runs early September through early February. In the
  // offseason (roughly March–August) ESPN rolls season.year forward to the
  // upcoming season while still serving the prior season's final standings,
  // so we guard on the calendar too: outside the season window all records are
  // zeroed out (blank) rather than rendering stale data as if it were live.
  const month = now.getMonth(); // 0 = January
  const inSeasonWindow = month >= 8 || month <= 1; // Sep–Dec or Jan–Feb
  const isCurrentYear = standings.season_year === currentYear;
  const live: Record<string, TeamStanding> = inSeasonWindow && isCurrentYear ? standings.by_canonical : {};
  const hasLive = Object.values(live).some((t) => t.games_played > 0);

  const byDivision = new Map<string, Franchise[]>();
  for (const f of getAllFranchises()) {
    const key = DIVISION_ORDER.includes(f.division) ? f.division : "Other";
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(f);
  }

  const fetchedDate = (() => {
    try {
      return new Date(standings.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  })();

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{currentYear} NFL Standings</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {hasLive
              ? <>Live from ESPN, refreshed hourly{fetchedDate ? `. As of ${fetchedDate}.` : "."}</>
              : <>The {currentYear} season has not started yet. Live standings from ESPN appear here once Week 1 begins.</>}
          </p>
        </div>
        <a href="https://www.espn.com/nfl/standings" target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full standings on ESPN &rarr;</a>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {DIVISION_ORDER.map((divName) => {
          const teams = byDivision.get(divName) ?? [];
          if (teams.length === 0) return null;
          const rows = teams.map((f) => ({ f, t: live[f.canonical] ?? null }));
          rows.sort((a, b) => {
            if (hasLive) {
              const aw = a.t?.win_pct ?? -1, bw = b.t?.win_pct ?? -1;
              if (bw !== aw) return bw - aw;
              const awn = a.t?.wins ?? 0, bwn = b.t?.wins ?? 0;
              if (bwn !== awn) return bwn - awn;
            }
            return a.f.name.localeCompare(b.f.name);
          });
          return (
            <div key={divName} className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">{divName}</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">T</th>
                    <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider">Pct</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ f, t }) => {
                    const logo = logoUrlFor(f.slug);
                    const mono = monogramFor(f.slug);
                    const showRec = hasLive && t != null && t.games_played > 0;
                    return (
                      <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pr-1">
                          <Link href={`/teams/nfl/${f.slug}`} className="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                            {logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                            ) : (
                              <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                            )}
                            <span className="truncate">{f.name}</span>
                          </Link>
                        </td>
                        <td className="py-1 px-1 text-right">{showRec ? t!.wins : "—"}</td>
                        <td className="py-1 px-1 text-right">{showRec ? t!.losses : "—"}</td>
                        <td className="py-1 px-1 text-right text-[var(--text-muted)]">{showRec ? t!.ties : "—"}</td>
                        <td className="py-1 pl-1 text-right text-[var(--text-muted)]">{showRec ? fmtPct(t!.win_pct) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
