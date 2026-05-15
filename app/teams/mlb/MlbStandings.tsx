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

type Region = "East" | "Central" | "West" | "Other";

function regionOf(division: string): Region {
  const lower = (division || "").toLowerCase();
  if (lower.includes("east")) return "East";
  if (lower.includes("central")) return "Central";
  if (lower.includes("west")) return "West";
  return "Other";
}

function leagueOf(team: TeamStanding): "AL" | "NL" | "" {
  if (team.league === "AL" || team.league === "NL") return team.league;
  // Fallback: division string may carry "American" or "National"
  const lower = (team.division || "").toLowerCase();
  if (lower.includes("american")) return "AL";
  if (lower.includes("national")) return "NL";
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
  const standings = await getCurrentMlbStandings();
  if (Object.keys(standings.by_canonical).length === 0) {
    // ESPN unreachable or feed empty — hide rather than ship a broken block.
    return null;
  }

  const franchises = getAllFranchises();
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  const slugByCanonical = new Map(franchises.map((f) => [f.canonical, f.slug]));

  // Bucket teams by (league, region). Each bucket is one division. The
  // raw division string from ESPN is preserved for the section label.
  type Bucket = { league: "AL" | "NL" | ""; region: Region; label: string; teams: TeamStanding[] };
  const buckets = new Map<string, Bucket>();
  for (const t of Object.values(standings.by_canonical)) {
    const league = leagueOf(t);
    const region = regionOf(t.division || "");
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
                  {b.teams.map((t) => {
                    const slug = slugByCanonical.get(t.canonical);
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
