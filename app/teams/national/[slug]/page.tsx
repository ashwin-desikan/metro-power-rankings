import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllNationalTeamSlugs,
  getNationalTeamBySlug,
  getAppearancesForTeam,
  getFinalsForTeam,
  getRankSnapshots,
  getWorldCup2026StageForTeam,
  getSimilarTeamsForTeam,
  type NationalTeamAppearance,
  type NationalTeamFinal,
  type SimilarTeamNeighbor,
  type TournamentCategory,
} from "@/lib/international";
import {
  CATEGORY_SHORT_LABEL,
  appearanceCategorySortKey,
  CONTINENT_COLORS,
  flagForTeam,
  flagCdnUrl,
  displayNameForTeam,
  HISTORICAL_FLAG,
} from "@/lib/international-display";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllNationalTeamSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = getNationalTeamBySlug(slug);
  if (!t) return { title: "Team not found" };
  const displayName = displayNameForTeam(t.slug, t.cur_name);
  const trophies = t.totals.trophies ?? 0;
  const desc =
    `${displayName} national football team: ` +
    `${trophies} senior trophy${trophies === 1 ? "" : "ies"} across ` +
    `${t.totals.tour_app} tournament appearance${t.totals.tour_app === 1 ? "" : "s"}.`;
  return {
    title: displayName,
    description: desc,
    alternates: { canonical: `/teams/national/${t.slug}` },
    openGraph: {
      title: `${displayName} (national team) | ${SITE_NAME}`,
      description: desc,
      url: `${BASE_URL}/teams/national/${t.slug}`,
      type: "website",
    },
  };
}

export default async function NationalTeamPage({ params }: Props) {
  const { slug } = await params;
  const team = getNationalTeamBySlug(slug);
  if (!team) notFound();

  const appearances = getAppearancesForTeam(slug);
  const finals = getFinalsForTeam(slug);
  const snapshots = getRankSnapshots();
  const similar = getSimilarTeamsForTeam(slug);

  // Honors strip pills.
  const honors: Array<{ label: string; count: number; lastYear?: number | null }> = [];
  if (team.world_cup.champ) {
    honors.push({ label: "World Cup titles", count: team.world_cup.champ, lastYear: team.world_cup.last_champ });
  }
  if (team.continental.champ) {
    honors.push({ label: "Continental titles", count: team.continental.champ, lastYear: team.continental.last_champ });
  }
  if (team.intercontinental.champ) {
    honors.push({ label: "Intercontinental titles", count: team.intercontinental.champ });
  }
  if (team.other.champ) {
    honors.push({ label: "Other tournament wins", count: team.other.champ });
  }
  if (team.world_cup.finals - team.world_cup.champ > 0) {
    honors.push({ label: "World Cup final runs", count: team.world_cup.finals });
  }
  if (team.continental.finals - team.continental.champ > 0) {
    honors.push({ label: "Continental finals reached", count: team.continental.finals });
  }

  const continentColor = team.continent ? CONTINENT_COLORS[team.continent] ?? "#525252" : "#525252";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/national"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to International Football
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/national" className="hover:underline">International Football</Link>
        {" / "}
        <span>{displayNameForTeam(team.slug, team.cur_name)}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: continentColor }}
            aria-hidden
          />
          {flagCdnUrl(team.slug, "40x30") && (
            <img src={flagCdnUrl(team.slug, "40x30")!} alt="" aria-hidden width={40} height={30} className="inline-block" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{displayNameForTeam(team.slug, team.cur_name)}</h1>
          {!team.active && (
            <span
              className="inline-block rounded px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
              style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
              title="No longer fielding a senior side"
            >
              Defunct
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {team.continent}
          {team.federation && <> · {team.federation}</>}
          {team.subdivision && <> · {team.subdivision}</>}
        </p>
        {(team.elo_rank || team.fifa_rank) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {team.elo_rank && (
              <span
                className="inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                title={`ELO ranking snapshot as of ${snapshots.elo}`}
              >
                <span className="font-semibold tabular-nums">#{team.elo_rank}</span>
                <span className="text-[var(--text-muted)]">ELO</span>
                <span className="text-[var(--text-dim)]">· {snapshots.elo}</span>
              </span>
            )}
            {team.fifa_rank && (
              <span
                className="inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                title={`FIFA ranking snapshot as of ${snapshots.fifa}`}
              >
                <span className="font-semibold tabular-nums">#{team.fifa_rank}</span>
                <span className="text-[var(--text-muted)]">FIFA</span>
                <span className="text-[var(--text-dim)]">· {snapshots.fifa}</span>
              </span>
            )}
          </div>
        )}
        {honors.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {honors.map((h) => (
              <span
                key={h.label}
                className="inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <span className="font-semibold tabular-nums">{h.count}</span>
                <span className="text-[var(--text-muted)]">{h.label}</span>
                {h.lastYear && (
                  <span className="text-[var(--text-muted)]">· last {h.lastYear}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </header>

      <section
        className="rounded-xl border p-5 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold">Footprint</h2>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Tournament appearances" value={String(team.totals.tour_app)} />
          <Stat label="Trophies" value={String(team.totals.trophies)} />
          <Stat label="Major trophies" value={String(team.totals.major_trophies)} />
          <Stat label="Last appearance" value={team.totals.last_app ? String(team.totals.last_app) : "-"} />
          <Stat label="World Cup appearances" value={String(team.world_cup.app)} />
          <Stat label="Continental appearances" value={String(team.continental.app)} />
          <Stat label="Last final reached" value={team.totals.last_finals ? String(team.totals.last_finals) : "-"} />
          <Stat label="Last trophy" value={team.totals.last_trophy ? String(team.totals.last_trophy) : "-"} />
        </div>
      </section>

      {similar.length > 0 && (
        <ComparablePrograms team={team} similar={similar} />
      )}

      <AppearancesTable
        appearances={appearances}
        team={{ ...team, cur_name: displayNameForTeam(team.slug, team.cur_name) }}
        wc2026Stage={getWorldCup2026StageForTeam(team.slug)}
      />

      {finals.length > 0 && <FinalsTable finals={finals} />}
    </main>
  );
}

// Editorial caption per pair. The shared-axis hint from the ETL points at
// the dimension that most defines the similarity; we map it to a short
// english phrase. Falls back to a generic line if shared_axis is null.
function captionForNeighbor(axis: string | null): string {
  switch (axis) {
    case "wc_champ": return "Multi-World-Cup-winning archetype";
    case "wc_finals_lost": return "Reached the World Cup final without winning it";
    case "wc_sf_only": return "Reached a World Cup semifinal but no further";
    case "continental_champ": return "Repeated continental champions";
    case "continental_finals_lost": return "Repeat continental finalists";
    case "intercontinental_champ": return "Intercontinental cup pedigree";
    case "tournament_span_years": return "Comparable historical longevity at the senior level";
    case "decade_coverage": return "Active across a similar set of decades";
    default: return "Closest cohort across honors profile and longevity";
  }
}

function ComparablePrograms({
  team,
  similar,
}: {
  team: { slug: string; cur_name: string };
  similar: SimilarTeamNeighbor[];
}) {
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-base font-semibold">Comparable programs</h2>
        <Link
          href="/teams/national#methodology"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline"
        >
          Methodology
        </Link>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
        Five national programs whose honors profile and historical footprint sit closest to {displayNameForTeam(team.slug, team.cur_name)}.
        Scored across World Cup pedigree, continental dominance (tier-adjusted), intercontinental wins,
        tournament span, and decade coverage. The labels describe the shared trait that drove the match.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {similar.map((n) => {
          const flag = flagCdnUrl(n.slug);
          const continentColor = n.continent ? CONTINENT_COLORS[n.continent] ?? "#525252" : "#525252";
          return (
            <Link
              key={n.slug}
              href={`/teams/national/${n.slug}`}
              className="block rounded-lg border p-3 transition hover:border-[var(--accent)]"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: continentColor }}
                  aria-hidden
                />
                {flag && <img src={flag} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" />}
                <span className="font-medium">{displayNameForTeam(n.slug, n.cur_name)}</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">{captionForNeighbor(n.shared_axis)}</div>
              {typeof n.honors_index === "number" && (
                <div className="mt-2 text-[10px] tabular-nums text-[var(--text-dim)]">
                  Honors {n.honors_index.toFixed(2)} · distance {n.distance.toFixed(2)}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

const CATEGORY_PILL_STYLE: Record<TournamentCategory, { bg: string; fg: string }> = {
  WC:    { bg: "rgba(212,175,55,0.22)", fg: "#d4af37" },  // gold-ish
  EUROS: { bg: "rgba(29,78,216,0.18)",  fg: "#1d4ed8" },
  COPA:  { bg: "rgba(21,128,61,0.18)",  fg: "#15803d" },
  AFCON: { bg: "rgba(234,179,8,0.20)",  fg: "#a16207" },
  ASIAN: { bg: "rgba(220,38,38,0.18)",  fg: "#dc2626" },
  GOLD:  { bg: "rgba(14,165,233,0.18)", fg: "#0284c7" },
  OFC:   { bg: "rgba(168,85,247,0.18)", fg: "#9333ea" },
  INTER: { bg: "rgba(192,192,192,0.20)", fg: "#6b7280" },
  OTHER: { bg: "rgba(120,120,140,0.16)", fg: "var(--text-muted)" },
};

function AppearancesTable({
  appearances,
  team,
  wc2026Stage,
}: {
  appearances: NationalTeamAppearance[];
  team: { cur_name: string };
  wc2026Stage: string | null;
}) {
  if (appearances.length === 0) {
    return (
      <section
        className="rounded-xl border p-5 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold">Tournament history</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">No tournament appearances on file.</p>
      </section>
    );
  }
  // Sort by year desc, then category priority within a year.
  const sorted = [...appearances].sort((a, b) => {
    const yd = (b.year ?? 0) - (a.year ?? 0);
    if (yd !== 0) return yd;
    return appearanceCategorySortKey(a.category) - appearanceCategorySortKey(b.category);
  });
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Tournament history</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent first. Every senior international tournament appearance on file: World Cups,
        continental cups, intercontinental tournaments, and selected others. The Name column shows
        what the team was called at the time of that appearance (Soviet Union, Yugoslavia,
        Czechoslovakia, etc. on rows played under a predecessor identity).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Year</th>
              <th className="py-2 text-left font-medium">Name</th>
              <th className="py-2 text-left font-medium">Tournament</th>
              <th className="py-2 text-left font-medium">Round reached</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const style = CATEGORY_PILL_STYLE[a.category];
              const shortLabel = CATEGORY_SHORT_LABEL[a.category];
              const nameAtTime = a.team_as ?? team.cur_name;
              return (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{a.year}</td>
                  <td className="py-1.5 text-sm">
                    {a.team_as ? (
                      <span className="inline-flex items-center gap-1 text-[var(--text)]">
                        <span aria-hidden title="Historical identity">{HISTORICAL_FLAG}</span>
                        <span>{nameAtTime}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{nameAtTime}</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: style.bg, color: style.fg }}
                        title={a.tournament_label}
                      >
                        {shortLabel}
                      </span>
                      <span>{a.tournament_label}</span>
                    </span>
                  </td>
                  <td className="py-1.5">
                    {a.year === 2026 && a.category === "WC" && wc2026Stage ? (
                      <Link
                        href="/teams/national#wc2026"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide hover:underline"
                        style={{
                          background: "rgba(59,130,246,0.18)",
                          color: "#3b82f6",
                        }}
                        title="Live 2026 World Cup standings and bracket on the International Football home page"
                      >
                        {wc2026Stage}
                        <span className="text-[9px] opacity-70" aria-hidden>→ live</span>
                      </Link>
                    ) : a.champion ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
                        title="Won this tournament"
                      >
                        <span aria-hidden>★</span> Champion
                      </span>
                    ) : a.round_reached === "Final" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={{
                          background: "transparent",
                          color: "var(--text-muted)",
                          boxShadow: "inset 0 0 0 1px rgba(120,120,140,0.45)",
                        }}
                        title="Reached final, lost"
                      >
                        <span aria-hidden>☆</span> Final
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{a.round_reached}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinalsTable({ finals }: { finals: NationalTeamFinal[] }) {
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Tournament finals</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every senior-tournament final this team has played. Wins highlighted in gold; losses muted.
        Penalty shootouts shown as &quot;PKs&quot; alongside the regulation score.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Year</th>
              <th className="py-2 text-left font-medium">Tournament</th>
              <th className="py-2 text-left font-medium">Opponent</th>
              <th className="py-2 px-2 text-right font-medium">Score</th>
              <th className="py-2 text-left font-medium">Result</th>
              <th className="py-2 text-left font-medium hidden sm:table-cell">Venue</th>
            </tr>
          </thead>
          <tbody>
            {finals.map((f, i) => {
              const isWin = f.result === "W";
              const scoreText = f.for_goals != null && f.against_goals != null
                ? `${f.for_goals}-${f.against_goals}`
                : "-";
              const pkText = f.penalty_kicks ? ` (PKs ${f.penalty_kicks})` : "";
              return (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{f.year}</td>
                  <td className="py-1.5">{f.competition}</td>
                  <td className="py-1.5">
                    {f.opp_slug && flagCdnUrl(f.opp_slug) && (
                      <img src={flagCdnUrl(f.opp_slug)!} alt="" aria-hidden width={20} height={15} className="inline-block mr-1.5" />
                    )}
                    {f.opp_slug ? (
                      <Link href={`/teams/national/${f.opp_slug}`} className="hover:underline">
                        {displayNameForTeam(f.opp_slug, f.opp_cur_name ?? "-")}
                      </Link>
                    ) : (
                      <span>{f.opp_cur_name ?? "-"}</span>
                    )}
                    {f.opp_team_as && (
                      <span className="text-[var(--text-muted)] text-xs ml-1">(as {f.opp_team_as})</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {scoreText}
                    {pkText && <span className="text-[var(--text-muted)] text-xs"> {pkText}</span>}
                  </td>
                  <td className="py-1.5">
                    {isWin ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
                      >
                        <span aria-hidden>★</span> Won
                      </span>
                    ) : f.result === "L" ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={{
                          background: "transparent",
                          color: "var(--text-muted)",
                          boxShadow: "inset 0 0 0 1px rgba(120,120,140,0.45)",
                        }}
                      >
                        <span aria-hidden>☆</span> Lost
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{f.result ?? "-"}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-xs text-[var(--text-muted)] hidden sm:table-cell">
                    {f.stadium && <>{f.stadium}</>}
                    {f.stad_country && <span>{f.stadium ? ", " : ""}{f.stad_country}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
