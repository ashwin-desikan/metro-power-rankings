import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllClubSlugs,
  getClubBySlug,
  getSeasonsForClub,
  getCupsForClub,
  getEuropeForClub,
  EUROPEAN_COMP_NAMES,
  COUNTRY_TIER_LABELS,
  COUNTRY_TOP_FLIGHT,
  type FootballSeason,
  type FootballCupFinal,
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
    `${c.league_seasons} season${c.league_seasons === 1 ? "" : "s"} of top-flight league football across ` +
    `tier${c.tiers.length > 1 ? "s" : ""} ${c.tiers.join(", ")}.`;
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

  // Most recent season summary.
  const latest = seasons.length ? seasons[seasons.length - 1] : null;
  const currentLeagueLabel =
    latest && latest.level && tierLabels[latest.level]
      ? tierLabels[latest.level]
      : latest?.league ?? null;

  // For German clubs, surface playoff appearances separately from league
  // seasons since pre-Bundesliga rows are knockout participants, not
  // round-robin standings.
  const showPlayoffSplit = club.playoff_appearances > 0;

  // Honors breakdown for the header chip strip.
  const honors: Array<{ label: string; count: number | null; lastYear?: number | null }> = [];
  if (club.totals.titles) honors.push({ label: "League titles", count: club.totals.titles, lastYear: club.totals.last_title });
  if (club.totals.major_cups) honors.push({ label: "Major cups", count: club.totals.major_cups, lastYear: club.totals.last_trophy });
  if (club.totals.league_finals) honors.push({ label: "Top-2 finishes", count: club.totals.league_finals });
  if (club.totals.league_t4) honors.push({ label: "Top-4 finishes", count: club.totals.league_t4 });

  const metroLink = club.metro ? `/rankings/${slugify(club.metro)}` : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>
        {" / "}
        <span>{club.cur_name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{club.cur_name}</h1>
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
          <Stat
            label={showPlayoffSplit ? "Bundesliga-era seasons" : "Top-flight league seasons"}
            value={String(club.league_seasons)}
          />
          {showPlayoffSplit && (
            <Stat label="Pre-Bundesliga national playoff appearances" value={String(club.playoff_appearances)} />
          )}
          <Stat label="First season" value={club.first_year ? String(club.first_year) : "-"} />
          <Stat label="Most recent season" value={club.last_year ? String(club.last_year) : "-"} />
        </div>
      </section>

      <SeasonsTable seasons={seasons} tierLabels={tierLabels} country={club.country} />

      {cups.length > 0 && <CupsBlock cups={cups} country={club.country} />}

      {europe.length > 0 && <EuropeBlock entries={europe} />}
    </main>
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

function SeasonsTable({
  seasons,
  tierLabels,
  country,
}: {
  seasons: FootballSeason[];
  tierLabels: Record<number, string>;
  country: string;
}) {
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
        Chronological top-flight history{" "}
        {country === "England" && "across Levels 1 through 5"}
        {country !== "England" && `in ${COUNTRY_TOP_FLIGHT[country] ?? "the top flight"}`}.
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
              <th className="py-2 text-left font-medium">Year</th>
              <th className="py-2 text-left font-medium">Competition</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pts</th>
              <th className="py-2 text-right font-medium">GF</th>
              <th className="py-2 text-right font-medium">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th className="py-2 text-right font-medium">Pos</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s, i) => {
              const tierLabel = (s.level && tierLabels[s.level]) || s.league || "-";
              const isChamp = s.place === 1 && s.format === "league";
              return (
                <tr
                  key={`${s.year}-${s.level}-${i}`}
                  className="border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-1.5 tabular-nums">{s.year ?? "-"}</td>
                  <td className="py-1.5">
                    <span className="font-medium">{tierLabel}</span>
                    {s.team && s.team !== s.cur_name && (
                      <span className="text-[var(--text-muted)] text-xs ml-2">
                        as {s.team}
                      </span>
                    )}
                    {s.format === "playoff" && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{ background: "var(--bg-subtle, #1a1a1a)", color: "var(--text-muted)" }}>
                        national playoff
                      </span>
                    )}
                    {isChamp && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{ background: "#f5d76e22", color: "#b58900" }}>
                        champion
                      </span>
                    )}
                    {s.relegated && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{ background: "#dc262622", color: "#dc2626" }}>
                        relegated
                      </span>
                    )}
                    {s.eur_qual && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                            style={{ background: "#3b82f622", color: "#3b82f6" }}>
                        europe
                      </span>
                    )}
                  </td>
                  {s.format === "league" ? (
                    <>
                      <td className="py-1.5 text-right tabular-nums">{s.matches ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.pts ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.gf ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.ga ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.place ?? "-"}</td>
                    </>
                  ) : (
                    <>
                      <td colSpan={8} className="py-1.5 text-right text-[var(--text-muted)] text-xs italic">
                        knockout-format championship; per-match data not recorded
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{s.place ?? "-"}</td>
                    </>
                  )}
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
  // Group by kind for readability: major (FA Cup, Copa del Rey, etc.) first,
  // then minor (League Cup / Coppa Italia / DFB-Pokal nominal-minor, etc.),
  // then super cup (Charity Shield / Supercopa / Supercoppa / Supercup / Trophée).
  const cupNames: Record<string, Record<string, string>> = {
    England: { major: "FA Cup", minor: "League Cup", super: "Community Shield" },
    Spain: { major: "Copa del Rey", minor: "Copa de la Liga", super: "Supercopa de España" },
    Italy: { major: "Coppa Italia", minor: "Coppa Italia Serie C", super: "Supercoppa Italiana" },
    Germany: { major: "DFB-Pokal", minor: "DFB-Ligapokal", super: "DFL-Supercup" },
    France: { major: "Coupe de France", minor: "Coupe de la Ligue", super: "Trophée des Champions" },
  };
  const names = cupNames[country] ?? { major: "Major cup", minor: "League cup", super: "Super cup" };

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Cup finals</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every domestic cup final the club has played, including losses. Scheduled finals (date not yet passed) are flagged.
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
            {cups.map((c, i) => (
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

function EuropeBlock({ entries }: { entries: { year: number | null; season: string | null; competition: string | null; code: string | null }[] }) {
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">European competition appearances</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        One row per entry across UEFA and Intercontinental club competitions.
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
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums">{e.season ?? e.year ?? "-"}</td>
                <td className="py-1.5">
                  {e.competition}
                  {e.code && EUROPEAN_COMP_NAMES[e.code] && e.code !== "OTHC" && (
                    <span className="ml-2 text-[var(--text-muted)] text-xs">({e.code})</span>
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
