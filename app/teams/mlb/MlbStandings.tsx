// MlbStandings — current-season standings widget for the /teams/mlb index.
// Pulls live data via @/lib/mlb-standings (ESPN public feed with hourly ISR).
// Renders six division mini-tables in a responsive grid, sorted by win pct.
//
// Division-name handling: ESPN can return the division string as either the
// abbreviated form ("AL East") or the long form ("American League East"),
// and the wrapping is sometimes by-division and sometimes by-league. We
// match tolerantly by league (AL/NL) + region keyword (East/Central/West)
// rather than a hard-coded label, so the widget renders correctly even
// when ESPN renames or restructures the feed.

import Link from "next/link";
import { getCurrentMlbStandings, type TeamStanding } from "@/lib/mlb-standings";
import { getAllFranchises, logoUrlFor, monogramFor } from "@/lib/mlb";
import { getMlbSim, playoffOddsByCanonical, fmtOdds } from "@/lib/mlbSim";

type Region = "East" | "Central" | "West" | "Other";

// Canonical-team region map. The 30 modern MLB clubs are a fixed
// partition across the 6 divisions and ESPN cosmetic renames don't move
// them. Used as a fallback when ESPN returns an empty division string
// (which 2026 has been doing intermittently — the source of the
// persistent 'Other' bucket bug).
const DIVISION_BY_TEAM: Record<string, "East" | "Central" | "West"> = {
  // AL
  "Yankees": "East", "Red Sox": "East", "Blue Jays": "East", "Orioles": "East", "Rays": "East",
  "Guardians": "Central", "Twins": "Central", "Royals": "Central", "Tigers": "Central", "White Sox": "Central",
  "Astros": "West", "Mariners": "West", "Rangers": "West", "Angels": "West", "Athletics": "West",
  // NL
  "Phillies": "East", "Mets": "East", "Braves": "East", "Marlins": "East", "Nationals": "East",
  "Cubs": "Central", "Brewers": "Central", "Cardinals": "Central", "Pirates": "Central", "Reds": "Central",
  "Dodgers": "West", "Giants": "West", "Padres": "West", "Diamondbacks": "West", "Rockies": "West",
};

function regionOf(team: TeamStanding): Region {
  const lower = (team.division || "").toLowerCase();
  if (lower.includes("east")) return "East";
  if (lower.includes("central")) return "Central";
  if (lower.includes("west")) return "West";
  // Canonical-team fallback — final line of defense when ESPN's division
  // string is empty or unrecognized.
  return DIVISION_BY_TEAM[team.canonical] || "Other";
}

// Workbook-anchored fallback: when ESPN omits a clean league marker, the
// 30 modern franchises split AL/NL deterministically. Used only when the
// upstream league field is empty AND the division string carries no
// recognizable cue.
const AL_TEAMS = new Set([
  "Yankees", "Red Sox", "Blue Jays", "Orioles", "Rays",
  "Guardians", "Twins", "Royals", "Tigers", "White Sox",
  "Astros", "Mariners", "Rangers", "Angels", "Athletics",
]);
const NL_TEAMS = new Set([
  "Phillies", "Mets", "Braves", "Marlins", "Nationals",
  "Cubs", "Brewers", "Cardinals", "Pirates", "Reds",
  "Dodgers", "Padres", "Giants", "Diamondbacks", "Rockies",
]);

function leagueOf(team: TeamStanding): "AL" | "NL" | "" {
  if (team.league === "AL" || team.league === "NL") return team.league;
  // Fallback 1: division string may carry "American" / "National" or
  // prefix "AL " / "NL ".
  const lower = (team.division || "").toLowerCase();
  if (lower.includes("american") || lower.startsWith("al ")) return "AL";
  if (lower.includes("national") || lower.startsWith("nl ")) return "NL";
  // Fallback 2: workbook-anchored team-name map (the 30 modern clubs are
  // a fixed partition; ESPN cosmetic renames don't move them between
  // leagues).
  if (AL_TEAMS.has(team.canonical)) return "AL";
  if (NL_TEAMS.has(team.canonical)) return "NL";
  return "";
}

const REGION_ORDER: Region[] = ["East", "Central", "West", "Other"];
const LEAGUE_ORDER: ("AL" | "NL" | "")[] = ["AL", "NL", ""];
const LEAGUE_LABEL: Record<string, string> = { AL: "AL", NL: "NL", "": "" };

function gamesBack(team: TeamStanding, leader: TeamStanding): number | null {
  if (team.canonical === leader.canonical) return null;
  return ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
}

export default async function MlbStandings() {
  const [standings, sim] = await Promise.all([getCurrentMlbStandings(), getMlbSim()]);
  if (Object.keys(standings.by_canonical).length === 0) {
    // ESPN unreachable or feed empty — hide rather than ship a broken block.
    return null;
  }
  // Playoff odds from our own Monte Carlo (scripts/predictions/build_mlb_sim.py).
  // The column only appears when the sim has data AND the season is actually
  // under way; preseason odds on a 0-0 table are noise, and an empty map keeps
  // the table identical to what shipped before.
  const odds = playoffOddsByCanonical(sim);
  const showOdds = odds.size >= 30 && (sim?.meta.games_played ?? 0) > 0;
  const oddsAsOf = showOdds ? sim!.meta.generated_at : null;
  // World Series odds ride the same sim file and the same gate.
  const wsOdds = new Map((sim?.table ?? []).map((r) => [r.canonical, r.p_ws]));

  const franchises = getAllFranchises();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const slugByCanonical = new Map(franchises.map((f) => [f.canonical, f.slug]));

  // Bucket teams by (league, region). Each bucket is one division. The
  // raw division string from ESPN is preserved for the section label.
  type Bucket = { league: "AL" | "NL" | ""; region: Region; label: string; teams: TeamStanding[] };
  const buckets = new Map<string, Bucket>();
  for (const t of Object.values(standings.by_canonical)) {
    const league = leagueOf(t);
    const region = regionOf(t);
    const key = `${league}|${region}`;
    if (!buckets.has(key)) {
      const label = t.division
        ? t.division
        : (league && region !== "Other" ? `${league} ${region}` : "Other");
      buckets.set(key, { league, region, label, teams: [] });
    }
    buckets.get(key)!.teams.push(t);
  }

  // Sort teams within each bucket desc by win pct, then wins desc.
  for (const b of buckets.values()) {
    b.teams.sort((a, b) => (b.win_pct - a.win_pct) || (b.wins - a.wins));
  }

  // Order buckets: AL East/Central/West, NL East/Central/West, then anything else.
  const ordered: Bucket[] = [];
  for (const lg of LEAGUE_ORDER) {
    for (const r of REGION_ORDER) {
      const key = `${lg}|${r}`;
      if (buckets.has(key)) ordered.push(buckets.get(key)!);
    }
  }

  // If we ended up with zero ordered buckets (shouldn't happen given we
  // already gated on by_canonical), hide the block.
  if (ordered.length === 0) return null;

  const fetchedDate = (() => {
    try {
      return new Date(standings.fetched_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return "";
    }
  })();

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{standings.season_year} MLB Standings</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Live from ESPN, refreshed hourly{fetchedDate ? `. As of ${fetchedDate}.` : "."}
            {showOdds && <>{" "}Green-shaded teams currently hold a playoff seed.</>}
            {oddsAsOf && (
              <>
                {" "}Playoff and World Series odds are our own simulation of the remaining schedule
                ({sim!.meta.sims.toLocaleString()} runs, {oddsAsOf}) —{" "}
                <Link href="/predictions" className="text-[var(--accent)] hover:underline">
                  how it works
                </Link>.
              </>
            )}
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
        {ordered.map((b) => {
          if (b.teams.length === 0) return null;
          const leader = b.teams[0];
          // Pretty label: prefer "AL East" form over "American League East"
          const pretty = b.league && b.region !== "Other"
            ? `${LEAGUE_LABEL[b.league]} ${b.region}`
            : b.label;
          return (
            <div
              key={`${b.league}-${b.region}`}
              className="rounded-xl border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2 flex items-baseline justify-between gap-2">
                <span>{pretty}</span>
                <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">{b.teams.length} teams</span>
              </h3>
              {(() => {
                const rowsData = b.teams.map((t) => {
                  const slug = slugByCanonical.get(t.canonical);
                  const fr = slug ? bySlug.get(slug) : null;
                  const logo = slug ? logoUrlFor(slug) : null;
                  const mono = slug ? monogramFor(slug) : null;
                  const displayShort = fr?.name ?? t.canonical ?? t.display_name;
                  const gb = gamesBack(t, leader);
                  const pct = t.win_pct ? t.win_pct.toFixed(3).replace(/^0/, "") : "—";
                  const gbLabel = gb === null ? "—" : gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1);
                  const po = showOdds ? (odds.get(t.canonical) ?? null) : null;
                  const ws = showOdds ? (wsOdds.get(t.canonical) ?? null) : null;
                  // A green tint marks the six current playoff seeds per
                  // league (ESPN's playoffSeed already applies the division-
                  // winners-then-wild-cards rules).
                  const inField = t.playoff_seed !== null && t.playoff_seed <= 6;
                  return { t, slug, logo, mono, displayShort, pct, gbLabel, po, ws, inField };
                });

                const TeamIdentity = ({ slug, logo, mono, displayShort }: (typeof rowsData)[number]) => (
                  slug ? (
                    <Link href={`/teams/mlb/${slug}`} className="flex items-center gap-1.5 min-w-0 hover:text-[var(--accent)] transition-colors">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
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
                    <span className="text-[var(--text-dim)] truncate">{displayShort}</span>
                  )
                );

                return (
                  <>
                    {/* Mobile: one compact card per team instead of a horizontally
                        scrolling 5-column table inside an already-narrow division box. */}
                    <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
                      {rowsData.map((row) => (
                        <div key={row.t.canonical}
                          className="py-2 flex items-center justify-between gap-2"
                          style={row.inField ? { background: "rgba(34,197,94,0.06)" } : undefined}>
                          <div className="min-w-0 flex-1 text-xs">
                            <TeamIdentity {...row} />
                          </div>
                          <div className="flex items-center gap-2.5 text-[10px] tabular-nums flex-shrink-0">
                            <span className="text-center w-5">
                              <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">W</span>
                              <span className="block font-semibold">{row.t.wins}</span>
                            </span>
                            <span className="text-center w-5">
                              <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">L</span>
                              <span className="block font-semibold">{row.t.losses}</span>
                            </span>
                            {/* Win pct is dropped on phones, not playoff odds:
                                Pct is exactly W/(W+L) and both are already on
                                this card, so it is the one metric here that
                                carries no information the reader cannot see.
                                Keeping five numeric columns at 390px would
                                squeeze the team name past legibility. */}
                            {!showOdds && (
                              <span className="text-center w-8">
                                <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">Pct</span>
                                <span className="block text-[var(--text-muted)]">{row.pct}</span>
                              </span>
                            )}
                            <span className="text-center w-6">
                              <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">GB</span>
                              <span className="block text-[var(--text-muted)]">{row.gbLabel}</span>
                            </span>
                            {showOdds && (
                              <span className="text-center w-9">
                                <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">Playoff</span>
                                <span
                                  className={`block ${(row.po ?? 0) >= 50 ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}
                                >
                                  {fmtOdds(row.po)}
                                </span>
                              </span>
                            )}
                            {showOdds && (
                              <span className="text-center w-8">
                                <span className="block text-[8px] uppercase tracking-wide text-[var(--text-dim)]">WS</span>
                                <span className="block text-[var(--text-muted)]">{fmtOdds(row.ws)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto hidden sm:block">
                      <table className="w-full text-xs tabular-nums">
                        <thead className="text-[var(--text-muted)]">
                          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                            <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                            <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                            <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                            <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">Pct</th>
                            <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider">GB</th>
                            {showOdds && (
                              <th
                                className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider whitespace-nowrap"
                                title="Our simulation's chance this team reaches the postseason"
                              >
                                Playoff
                              </th>
                            )}
                            {showOdds && (
                              <th
                                className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider whitespace-nowrap"
                                title="Our simulation's chance this team wins the World Series"
                              >
                                WS
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {rowsData.map((row) => (
                            <tr key={row.t.canonical} className="border-b last:border-b-0"
                              style={{ borderColor: "var(--border)", ...(row.inField ? { background: "rgba(34,197,94,0.06)" } : null) }}>
                              <td className="py-2 pr-1">
                                <TeamIdentity {...row} />
                              </td>
                              <td className="py-1 px-1 text-right">{row.t.wins}</td>
                              <td className="py-1 px-1 text-right">{row.t.losses}</td>
                              <td className="py-1 px-1 text-right text-[var(--text-muted)]">{row.pct}</td>
                              <td className="py-1 pl-1 text-right text-[var(--text-muted)]">{row.gbLabel}</td>
                              {showOdds && (
                                <td
                                  className={`py-1 pl-1 text-right ${(row.po ?? 0) >= 50 ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}
                                >
                                  {fmtOdds(row.po)}
                                </td>
                              )}
                              {showOdds && (
                                <td className="py-1 pl-1 text-right text-[var(--text-muted)]">{fmtOdds(row.ws)}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}
