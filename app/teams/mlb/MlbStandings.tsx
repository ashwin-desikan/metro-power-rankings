// MlbStandings — current-season standings widget for the /teams/mlb index.
// Pulls live data via @/lib/mlb-standings (ESPN public feed with hourly ISR).
// Renders six division mini-tables in a responsive grid, sorted by win pct.

import Link from "next/link";
import { getCurrentMlbStandings, type TeamStanding } from "@/lib/mlb-standings";
import { getAllFranchises, logoUrlFor, monogramFor } from "@/lib/mlb";

type Props = {
  // Optional override for the canonical division order; defaults to the
  // post-2013 alignment with AL on top, NL on bottom, geography left to right.
  divisionOrder?: string[];
};

const DEFAULT_DIVISION_ORDER = [
  "AL East",
  "AL Central",
  "AL West",
  "NL East",
  "NL Central",
  "NL West",
];

// Compute games-back from the division leader. MLB convention is
// GB = ((leader_w - team_w) + (team_l - leader_l)) / 2. Returns null when
// the team IS the leader (so the UI can render "—" instead of "0.0").
function gamesBack(team: TeamStanding, leader: TeamStanding): number | null {
  if (team.canonical === leader.canonical) return null;
  return ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
}

export default async function MlbStandings({ divisionOrder = DEFAULT_DIVISION_ORDER }: Props) {
  const standings = await getCurrentMlbStandings();
  if (!standings.source_label || Object.keys(standings.by_canonical).length === 0) {
    // ESPN unreachable or feed empty — silently hide the widget rather than
    // shipping a broken block. The franchise table below is still useful.
    return null;
  }

  // Build franchise lookup so we can render the proper display name + logo
  // + per-franchise slug for linking. ESPN's display_name is decent but the
  // workbook canonical name is what we use everywhere else on the site.
  const franchises = getAllFranchises();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const bySlugByCanonical = new Map(franchises.map((f) => [f.canonical, f.slug]));

  // Group ESPN rows by their division string.
  const byDivision = new Map<string, TeamStanding[]>();
  for (const t of Object.values(standings.by_canonical)) {
    if (!t.division) continue;
    if (!byDivision.has(t.division)) byDivision.set(t.division, []);
    byDivision.get(t.division)!.push(t);
  }
  // Sort each division by win pct desc, then by wins desc as tiebreak.
  for (const [, teams] of byDivision) {
    teams.sort((a, b) => (b.win_pct - a.win_pct) || (b.wins - a.wins));
  }

  // If the division names we got don't match the default order (unlikely
  // but possible if ESPN renames anything), fall back to whatever ESPN gave.
  const orderedDivisions = divisionOrder.filter((d) => byDivision.has(d));
  const remaining = Array.from(byDivision.keys()).filter((d) => !orderedDivisions.includes(d));
  const finalOrder = [...orderedDivisions, ...remaining];

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{standings.season_year} MLB Standings</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Sorted by win percentage within each division. Live from ESPN, refreshed hourly. As of {new Date(standings.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          </p>
        </div>
        <a
          href="https://www.espn.com/mlb/standings"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Full standings on ESPN &rarr;
        </a>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {finalOrder.map((div) => {
          const teams = byDivision.get(div) ?? [];
          if (teams.length === 0) return null;
          const leader = teams[0];
          return (
            <div
              key={div}
              className="rounded-xl border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2 flex items-baseline justify-between gap-2">
                <span>{div}</span>
                <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">{teams.length} teams</span>
              </h3>
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">Pct</th>
                    <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider">GB</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const slug = bySlugByCanonical.get(t.canonical);
                    const fr = slug ? bySlug.get(slug) : null;
                    const logo = slug ? logoUrlFor(slug) : null;
                    const mono = slug ? monogramFor(slug) : null;
                    const displayShort = fr?.name ?? t.canonical ?? t.display_name;
                    const gb = gamesBack(t, leader);
                    return (
                      <tr key={t.canonical} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1 pr-1">
                          {slug ? (
                            <Link href={`/teams/mlb/${slug}`} className="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" />
                              ) : (
                                <span
                                  className="inline-grid place-items-center rounded-full flex-shrink-0"
                                  style={{ background: mono?.bg, color: mono?.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }}
                                  aria-hidden
                                >
                                  {mono?.mono}
                                </span>
                              )}
                              <span className="truncate">{displayShort}</span>
                            </Link>
                          ) : (
                            <span className="text-[var(--text-dim)]">{displayShort}</span>
                          )}
                        </td>
                        <td className="py-1 px-1 text-right">{t.wins}</td>
                        <td className="py-1 px-1 text-right">{t.losses}</td>
                        <td className="py-1 px-1 text-right text-[var(--text-muted)]">{t.win_pct ? t.win_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                        <td className="py-1 pl-1 text-right text-[var(--text-muted)]">{gb === null ? "—" : gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
