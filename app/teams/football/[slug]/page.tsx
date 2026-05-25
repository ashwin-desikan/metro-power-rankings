import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllClubSlugs,
  getClubBySlug,
  getSeasonsForClub,
  getCupsForClub,
  getEuropeForClub,
  monogramForFootball,
  EUROPEAN_COMP_NAMES,
  COUNTRY_TIER_LABELS,
  COUNTRY_TOP_FLIGHT,
  type FootballSeason,
  type FootballCupFinal,
  type FootballEuropeEntry,
} from "@/lib/football";
import { slugify } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllClubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getClubBySlug(slug);
  if (!c) return { title: "Club not found" };
  const titles = c.totals.titles ?? 0;
  const desc =
    `${c.cur_name}${c.metro ? ` (${c.metro}, ${c.country})` : ` (${c.country})`}: ` +
    `${titles} domestic league title${titles === 1 ? "" : "s"}, ` +
    `${c.top_flight_seasons} top-flight (Level 1) season${c.top_flight_seasons === 1 ? "" : "s"}` +
    `${c.lower_tier_seasons > 0 ? `, plus ${c.lower_tier_seasons} lower-tier seasons` : ""}.`;
  return {
    title: c.cur_name,
    description: desc,
    alternates: { canonical: `/teams/football/${c.slug}` },
    openGraph: {
      title: `${c.cur_name} | ${SITE_NAME}`,
      description: desc,
      url: `${BASE_URL}/teams/football/${c.slug}`,
      type: "website",
    },
  };
}

export default async function FootballClubPage({ params }: Props) {
  const { slug } = await params;
  const club = getClubBySlug(slug);
  if (!club) notFound();

  const seasons = getSeasonsForClub(slug);
  const cups = getCupsForClub(slug);
  const europe = getEuropeForClub(slug);
  const tierLabels = COUNTRY_TIER_LABELS[club.country] ?? {};

  // Most-recent season (after ETL the array is descending; first row wins).
  const latest = seasons.length ? seasons[0] : null;
  const currentLeagueLabel =
    latest && latest.level && tierLabels[latest.level]
      ? tierLabels[latest.level]
      : latest?.league ?? null;

  // German pre-Bundesliga playoff count is surfaced separately because the
  // workbook only carries participants, not league standings, for that era.
  // Gate strictly on country=Germany since other countries' early-era rows
  // (Italy pre-1929, France pre-1929) may also be playoff-format but the
  // label naming-wise only makes sense for Germany.
  const showPlayoffSplit = club.country === "Germany" && club.playoff_appearances > 0;

  // Honors strip for the header.
  const honors: Array<{ label: string; count: number | null; lastYear?: number | null }> = [];
  if (club.totals.titles) honors.push({ label: "League titles", count: club.totals.titles, lastYear: club.totals.last_title });
  if (club.totals.major_cups) honors.push({ label: "Major cups", count: club.totals.major_cups, lastYear: club.totals.last_trophy });
  if (club.totals.league_finals) honors.push({ label: "Top-2 finishes", count: club.totals.league_finals });
  if (club.totals.league_t4) honors.push({ label: "Top-4 finishes", count: club.totals.league_t4 });

  const metroLink = club.metro ? `/rankings/${slugify(club.metro)}` : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/football"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to Football
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>
        {" / "}
        <span>{club.cur_name}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <ColorBall slug={club.slug} name={club.cur_name} size={40} fontSize={14} />
          <h1 className="text-3xl font-semibold tracking-tight">{club.cur_name}</h1>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {club.city && <>{club.city}, </>}
          {metroLink ? (
            <Link href={metroLink} className="hover:underline">{club.metro}</Link>
          ) : club.metro ? (
            <>{club.metro}</>
          ) : null}
          {club.metro && club.country && " · "}
          {club.country}
          {currentLeagueLabel && <> · {currentLeagueLabel}</>}
        </p>
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
          <Stat label="Tiers played" value={club.tiers.length > 0 ? club.tiers.map((t) => `L${t}`).join(", ") : "-"} />
          <Stat label="Top-flight (L1) seasons" value={String(club.top_flight_seasons)} />
          {club.lower_tier_seasons > 0 && (
            <Stat label="Lower-tier league seasons" value={String(club.lower_tier_seasons)} />
          )}
          {showPlayoffSplit && (
            <Stat label="Pre-Bundesliga national playoff appearances" value={String(club.playoff_appearances)} />
          )}
          <Stat label="First season" value={club.first_year ? String(club.first_year) : "-"} />
          <Stat label="Most recent season" value={club.last_year ? String(club.last_year) : "-"} />
        </div>
      </section>

      <SeasonsTable
        seasons={seasons}
        tierLabels={tierLabels}
        country={club.country}
        europe={europe}
      />

      {cups.length > 0 && <CupsBlock cups={cups} country={club.country} />}

      {europe.length > 0 && <EuropeBlock entries={europe} />}
    </main>
  );
}

function ColorBall({
  slug,
  name,
  size = 24,
  fontSize = 10,
}: {
  slug: string;
  name: string;
  size?: number;
  fontSize?: number;
}) {
  const m = monogramForFootball(name, slug);
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{
        background: m.bg,
        color: m.fg,
        width: size,
        height: size,
        fontSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {m.mono}
    </span>
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

// Subtle highlight tint for the Pos + Pts columns.
const POS_HIGHLIGHT = { background: "rgba(78,205,196,0.07)" } as const;
const PTS_HIGHLIGHT = { background: "rgba(245,215,110,0.07)" } as const;

// European competitions that count as a per-season entry on the club row.
// Excludes Super Cup (USC), Club World Cup (FCWC), Intercontinental Cup
// (IC), Recopa Sudamericana (RCSA), Copa Interamericana (CI) per editorial
// spec. CL + CLB are both Champions League (qualifying vs main bracket).
const SEASON_COMP_INCLUDE = new Set(["CL", "CLB", "EL", "CWC", "EUCL", "OTH", "OTHC"]);
const GOLD_TROPHY_CODES = new Set(["CL", "CLB"]); // European Cup / Champions League

function SeasonsTable({
  seasons,
  tierLabels,
  country,
  europe,
}: {
  seasons: FootballSeason[];
  tierLabels: Record<number, string>;
  country: string;
  europe: FootballEuropeEntry[];
}) {
  // Index European entries by year for O(1) lookup per season row.
  const europeByYear = new Map<number, FootballEuropeEntry[]>();
  for (const e of europe) {
    if (e.year === null) continue;
    if (!e.code || !SEASON_COMP_INCLUDE.has(e.code)) continue;
    if (!europeByYear.has(e.year)) europeByYear.set(e.year, []);
    europeByYear.get(e.year)!.push(e);
  }
  if (seasons.length === 0) {
    return (
      <section
        className="rounded-xl border p-5 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold">Season-by-season</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">No standings rows on file.</p>
      </section>
    );
  }
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Season-by-season</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent season first.{" "}
        {country === "England" && "Covers Levels 1 through 5 of the English pyramid. "}
        {country !== "England" && `Covers ${COUNTRY_TOP_FLIGHT[country] ?? "the top flight"} only. `}
        Rows tagged "national playoff" are pre-modern formats where the workbook records only
        playoff participants, not round-robin standings.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">Year</th>
              <th className="py-2 text-left font-medium">League</th>
              <th className="py-2 text-left font-medium">Team</th>
              <th className="py-2 px-2 text-right font-medium" style={POS_HIGHLIGHT}>Pos</th>
              <th className="py-2 text-left font-medium">Notes</th>
              <th className="py-2 text-left font-medium">Eur Comp</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 px-2 text-right font-medium" style={PTS_HIGHLIGHT}>Pts</th>
              <th className="py-2 text-right font-medium">GF</th>
              <th className="py-2 text-right font-medium">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th
                className="py-2 pl-3 text-left font-medium whitespace-nowrap"
                title="European competition the club qualified for next season"
              >
                Eur Qual <span className="text-[var(--text-dim)] normal-case font-normal">(next yr)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s, i) => {
              // League name comes straight from the workbook (e.g. 'First
              // Division', 'Premier League', 'Deutsche Fußballmeisterschaft')
              // with the level as a numeric suffix in parens. tierLabels
              // table is no longer consulted here per editorial spec.
              const leagueLabel = s.league || "-";
              // Champion pill = workbook BX (Champions) flag.
              const isChamp = s.champion === true;
              return (
                <tr
                  key={`${s.year}-${s.level}-${i}`}
                  className="border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{s.year ?? "-"}</td>
                  <td className="py-1.5">
                    <span>{leagueLabel}</span>
                    {s.level && (
                      <span className="text-[var(--text-muted)] ml-1 tabular-nums">({s.level})</span>
                    )}
                  </td>
                  <td className="py-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                    {s.team || s.cur_name}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={POS_HIGHLIGHT}>
                    {s.place ?? "-"}
                  </td>
                  <td className="py-1.5">
                    <span className="inline-flex flex-wrap gap-1">
                      {s.format === "playoff" && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}>
                          national playoff
                        </span>
                      )}
                      {isChamp && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}>
                          champion
                        </span>
                      )}
                      {s.promoted && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                          promoted
                        </span>
                      )}
                      {s.relegated && (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
                          relegated
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 text-xs">
                    {(() => {
                      const entries = (s.year !== null ? europeByYear.get(s.year) : null) ?? [];
                      if (entries.length === 0) return null;
                      return (
                        <span className="inline-flex flex-wrap gap-1">
                          {entries.map((e, ei) => {
                            const isGold = e.trophy_won && e.code && GOLD_TROPHY_CODES.has(e.code);
                            const isSilver = e.trophy_won && !isGold;
                            const bg = isGold
                              ? "rgba(212,175,55,0.22)"
                              : isSilver
                                ? "rgba(192,192,192,0.20)"
                                : "rgba(120,120,140,0.16)";
                            const fg = isGold ? "#d4af37" : isSilver ? "#c0c0c0" : "var(--text-muted)";
                            const title = e.trophy_won
                              ? `${e.competition} winner this season`
                              : `${e.competition}: ${e.result_label}`;
                            return (
                              <span
                                key={ei}
                                className="inline-block rounded px-1.5 py-0.5 font-semibold tracking-wide"
                                style={{ background: bg, color: fg }}
                                title={title}
                              >
                                {e.trophy_won && (
                                  <span aria-hidden className="mr-0.5">★</span>
                                )}
                                {e.code}
                              </span>
                            );
                          })}
                        </span>
                      );
                    })()}
                  </td>
                  {s.format === "league" ? (
                    <>
                      <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={PTS_HIGHLIGHT}>{s.pts ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.gf ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.ga ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
                    </>
                  ) : (
                    <td colSpan={7} className="py-1.5 text-right text-[var(--text-muted)] text-xs italic" style={PTS_HIGHLIGHT}>
                      knockout-format championship; per-match data not recorded
                    </td>
                  )}
                  <td className="py-1.5 pl-3 text-xs whitespace-nowrap">
                    {s.eur_qual && (
                      <span
                        className="inline-block rounded px-1.5 py-0.5 font-semibold tracking-wide"
                        style={{ background: "rgba(59,130,246,0.18)", color: "#3b82f6" }}
                        title="Qualified for this European competition next season"
                      >
                        {s.eur_qual}
                      </span>
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

function CupsBlock({ cups, country }: { cups: FootballCupFinal[]; country: string }) {
  const cupNames: Record<string, Record<string, string>> = {
    England: { major: "FA Cup", minor: "League Cup", super: "Community Shield" },
    Spain: { major: "Copa del Rey", minor: "Copa de la Liga", super: "Supercopa de España" },
    Italy: { major: "Coppa Italia", minor: "Coppa Italia Serie C", super: "Supercoppa Italiana" },
    Germany: { major: "DFB-Pokal", minor: "DFB-Ligapokal", super: "DFL-Supercup" },
    France: { major: "Coupe de France", minor: "Coupe de la Ligue", super: "Trophée des Champions" },
  };
  const names = cupNames[country] ?? { major: "Major cup", minor: "League cup", super: "Super cup" };

  // Descending: newest cup final first.
  const sorted = [...cups].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Cup finals</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent first. Every domestic cup final the club has played, including losses. Scheduled finals (date not yet passed) are flagged.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Year</th>
              <th className="py-2 text-left font-medium">Competition</th>
              <th className="py-2 text-left font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums">{c.year ?? "-"}</td>
                <td className="py-1.5">{names[c.kind]}</td>
                <td className="py-1.5">
                  {c.result === "won" && (
                    <span className="font-medium" style={{ color: "#b58900" }}>Won</span>
                  )}
                  {c.result === "lost" && (
                    <span className="text-[var(--text-muted)]">Runner-up</span>
                  )}
                  {c.result === "scheduled" && (
                    <span className="text-[var(--text-muted)] italic">Scheduled</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EuropeBlock({ entries }: { entries: FootballEuropeEntry[] }) {
  // Already descending from the ETL (sort key: -(year), competition).
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">European competition appearances</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent first. One row per entry showing the deepest round reached. A Cup Winner badge marks tournaments the club won: gold for the European Cup / Champions League, silver for every other UEFA or Intercontinental trophy.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Season</th>
              <th className="py-2 text-left font-medium">Competition</th>
              <th className="py-2 text-left font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isUcl = e.code === "CL" || e.code === "CLB";
              return (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 tabular-nums">{e.season ?? e.year ?? "-"}</td>
                  <td className="py-1.5">
                    {e.competition}
                    {e.code && EUROPEAN_COMP_NAMES[e.code] && e.code !== "OTHC" && (
                      <span className="ml-2 text-[var(--text-muted)] text-xs">({e.code})</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {e.trophy_won ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                        style={
                          isUcl
                            ? { background: "rgba(212,175,55,0.18)", color: "#d4af37" }
                            : { background: "rgba(192,192,192,0.16)", color: "#c0c0c0" }
                        }
                        title={isUcl ? "European Cup / Champions League winner" : "European trophy winner"}
                      >
                        Cup Winner
                      </span>
                    ) : (
                      <span>{e.result_label}</span>
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
