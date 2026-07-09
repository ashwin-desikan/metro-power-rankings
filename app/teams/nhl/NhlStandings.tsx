// NhlStandings — live current-season standings for /teams/nhl.
// Pulls @/lib/nhl-standings (ESPN public feed with hourly ISR). Renders
// four division mini-tables (Atlantic, Metropolitan, Central, Pacific)
// grouped two-and-two under Eastern and Western conference headers.

import Link from "next/link";
import { getCurrentNhlStandings, type TeamStanding } from "@/lib/nhl-standings";
import { getAllFranchises, logoUrlFor, monogramFor } from "@/lib/nhl";

type Region = "Atlantic" | "Metropolitan" | "Central" | "Pacific" | "Other";

function regionOf(division: string): Region {
  const lower = (division || "").toLowerCase();
  if (lower.includes("atlantic")) return "Atlantic";
  if (lower.includes("metropolitan")) return "Metropolitan";
  if (lower.includes("central")) return "Central";
  if (lower.includes("pacific")) return "Pacific";
  return "Other";
}

const EAST_TEAMS = new Set([
  "Bruins", "Sabres", "Red Wings", "Panthers", "Canadiens", "Senators",
  "Lightning", "Maple Leafs",
  "Hurricanes", "Blue Jackets", "Devils", "Islanders", "Rangers", "Flyers",
  "Penguins", "Capitals",
]);
const WEST_TEAMS = new Set([
  "Blackhawks", "Avalanche", "Stars", "Wild", "Predators", "Blues",
  "Mammoth", "Jets",
  "Ducks", "Flames", "Oilers", "Kings", "Sharks", "Kraken", "Canucks",
  "Golden Knights",
]);

const DIVISION_BY_TEAM: Record<string, Region> = {
  // Eastern - Atlantic
  "Bruins": "Atlantic", "Sabres": "Atlantic", "Red Wings": "Atlantic",
  "Panthers": "Atlantic", "Canadiens": "Atlantic", "Senators": "Atlantic",
  "Lightning": "Atlantic", "Maple Leafs": "Atlantic",
  // Eastern - Metropolitan
  "Hurricanes": "Metropolitan", "Blue Jackets": "Metropolitan",
  "Devils": "Metropolitan", "Islanders": "Metropolitan",
  "Rangers": "Metropolitan", "Flyers": "Metropolitan",
  "Penguins": "Metropolitan", "Capitals": "Metropolitan",
  // Western - Central
  "Blackhawks": "Central", "Avalanche": "Central", "Stars": "Central",
  "Wild": "Central", "Predators": "Central", "Blues": "Central",
  "Mammoth": "Central", "Jets": "Central",
  // Western - Pacific
  "Ducks": "Pacific", "Flames": "Pacific", "Oilers": "Pacific",
  "Kings": "Pacific", "Sharks": "Pacific", "Kraken": "Pacific",
  "Canucks": "Pacific", "Golden Knights": "Pacific",
};

function conferenceOf(team: TeamStanding): "E" | "W" | "" {
  if (team.conference === "E" || team.conference === "W") return team.conference;
  if (EAST_TEAMS.has(team.canonical)) return "E";
  if (WEST_TEAMS.has(team.canonical)) return "W";
  return "";
}

function resolveDivision(team: TeamStanding): Region {
  const r = regionOf(team.division);
  if (r !== "Other") return r;
  return DIVISION_BY_TEAM[team.canonical] || "Other";
}

const DIVISION_ORDER: Region[] = ["Atlantic", "Metropolitan", "Central", "Pacific"];
const CONF_LABEL: Record<string, string> = { E: "Eastern", W: "Western" };

export default async function NhlStandings() {
  const standings = await getCurrentNhlStandings();
  if (Object.keys(standings.by_canonical).length === 0) {
    return null;
  }

  const franchises = getAllFranchises();
  const bySlug = new Map(franchises.map(f => [f.slug, f]));
  const slugByCanonical = new Map(franchises.map(f => [f.canonical, f.slug]));

  type Bucket = { conf: "E" | "W" | ""; division: Region; teams: TeamStanding[] };
  const buckets = new Map<string, Bucket>();
  for (const t of Object.values(standings.by_canonical)) {
    const conf = conferenceOf(t);
    const division = resolveDivision(t);
    const key = `${conf}|${division}`;
    if (!buckets.has(key)) {
      buckets.set(key, { conf, division, teams: [] });
    }
    buckets.get(key)!.teams.push(t);
  }

  for (const b of buckets.values()) {
    b.teams.sort((a, b) => (b.points - a.points) || (b.wins - a.wins) || (b.goal_diff - a.goal_diff));
  }

  // Group conferences -> divisions in fixed order.
  const eastBuckets: Bucket[] = [];
  const westBuckets: Bucket[] = [];
  for (const d of DIVISION_ORDER) {
    const eKey = `E|${d}`;
    const wKey = `W|${d}`;
    if (buckets.has(eKey)) eastBuckets.push(buckets.get(eKey)!);
    if (buckets.has(wKey)) westBuckets.push(buckets.get(wKey)!);
  }

  const fetchedDate = (() => {
    try {
      return new Date(standings.fetched_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch { return ""; }
  })();

  function renderBucket(b: Bucket) {
    if (b.teams.length === 0) return null;
    return (
      <div
        key={`${b.conf}-${b.division}`}
        className="rounded-xl border p-3"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2 flex items-baseline justify-between gap-2">
          <span>{b.division}</span>
          <span className="text-[10px] normal-case tracking-normal text-[var(--text-dim)]">{b.teams.length} teams</span>
        </h3>
        <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-[var(--text-muted)]">
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
              <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">GP</th>
              <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
              <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
              <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">OTL</th>
              <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider">Pts</th>
            </tr>
          </thead>
          <tbody>
            {b.teams.map(t => {
              const slug = slugByCanonical.get(t.canonical);
              const fr = slug ? bySlug.get(slug) : null;
              const logo = slug ? logoUrlFor(slug) : null;
              const mono = slug ? monogramFor(slug) : null;
              const displayShort = fr?.name ?? t.canonical ?? t.display_name;
              return (
                <tr key={t.canonical} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-1">
                    {slug ? (
                      <Link href={`/teams/nhl/${slug}`} className="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                        {logo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
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
                      <span className="text-[var(--text-dim)]">{displayShort}</span>
                    )}
                  </td>
                  <td className="py-1 px-1 text-right">{t.games_played}</td>
                  <td className="py-1 px-1 text-right">{t.wins}</td>
                  <td className="py-1 px-1 text-right">{t.losses}</td>
                  <td className="py-1 px-1 text-right">{t.ot_losses}</td>
                  <td className="py-1 pl-1 text-right font-semibold">{t.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    );
  }

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{standings.season_year} NHL Standings</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Live from ESPN, refreshed hourly{fetchedDate ? `. As of ${fetchedDate}.` : "."}
          </p>
        </div>
        <a
          href="https://www.espn.com/nhl/standings"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Full standings on ESPN &rarr;
        </a>
      </header>

      {[{ conf: "E" as const, buckets: eastBuckets, label: CONF_LABEL.E },
        { conf: "W" as const, buckets: westBuckets, label: CONF_LABEL.W }].map(group => (
        group.buckets.length === 0 ? null : (
          <div key={group.conf} className="mb-4">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-2">{group.label} Conference</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.buckets.map(renderBucket)}
            </div>
          </div>
        )
      ))}
    </section>
  );
}
