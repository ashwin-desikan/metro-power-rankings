import type { Metadata } from "next";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { notFound } from "next/navigation";
import {
  getAllEuropeanTournamentHubSlugs,
  getEuropeanTournamentHub,
  monogramForFootball,
  type EuropeanCurrentEntry,
} from "@/lib/football";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import MostDecoratedTable from "./MostDecoratedTable";
import ContinentalTable from "./ContinentalTable";
import { getClubCompetitions } from "@/lib/clubFootballLive";
import LiveCompGroups from "./LiveCompGroups";
import LiveCompFixtures from "./LiveCompFixtures";
import HubNav from "@/app/teams/HubNav";

// api-football competition ids for the tournament hubs that carry live standings.
const COMP_ID_BY_SLUG: Record<string, number> = {
  "champions-league": 2, "europa-league": 3, "conference-league": 848, "uefa-super-cup": 531,
};

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllEuropeanTournamentHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = getEuropeanTournamentHub(slug);
  if (!hub) return { title: "Tournament not found" };
  const desc =
    `${hub.label}: ${hub.editions} edition${hub.editions === 1 ? "" : "s"}` +
    (hub.year_min && hub.year_max ? ` (${hub.year_min}–${hub.year_max}).` : ".") +
    ` ${hub.era_notes}`;
  return {
    title: hub.label,
    description: desc,
    alternates: { canonical: `/teams/football/tournaments/${hub.slug}` },
    openGraph: {
      title: `${hub.label} | ${SITE_NAME}`,
      description: desc,
      url: `${BASE_URL}/teams/football/tournaments/${hub.slug}`,
      type: "website",
    },
  };
}

export default async function ClubTournamentHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getEuropeanTournamentHub(slug);
  if (!hub) notFound();

  if (hub.grouped_by_confederation && hub.sections) {
    return <ContinentalHubView hub={hub} />;
  }

  const hasCurrent = hub.active && hub.current_entries.length > 0;
  const compId = COMP_ID_BY_SLUG[slug];
  const liveComp = hub.active && compId ? ((await getClubCompetitions()).find((c) => c.league_id === compId) ?? null) : null;
  const hasGroups = !!liveComp && liveComp.groups.length > 0;
  const hasFixtures = !!liveComp && liveComp.fixtures.length > 0;

  const navItems = [
    ...(hasGroups ? [{ label: "Standings", href: "#groups" }] : []),
    ...(hasFixtures ? [{ label: "Fixtures", href: "#fixtures" }] : []),
    ...(hasCurrent ? [{ label: "Current Season", href: "#current" }] : []),
    { label: "All-Time Finals", href: "#finals" },
    ...(hub.most_decorated.length > 0 ? [{ label: "Most Decorated", href: "#most-decorated" }] : []),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link
          href="/teams/football/tournaments"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <span aria-hidden>←</span>
          Back to Tournaments
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Club Football</Link>
        {" / "}
        <Link href="/teams/football/tournaments" className="hover:underline">Tournaments</Link>
        {" / "}
        <span>{hub.short_label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-semibold tracking-tight">{hub.label}</h1>
          {!hub.active && (
            <span
              className="inline-block rounded px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
              style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
              title="Discontinued competition"
            >
              Defunct
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">{hub.era_notes}</p>
        <p className="mt-3 text-xs text-[var(--text-muted)] tabular-nums">
          {hub.editions} edition{hub.editions === 1 ? "" : "s"}
          {hub.year_min && hub.year_max ? <> · {hub.year_min}–{hub.year_max}</> : null}
          {hub.most_decorated.length > 0 && (
            <>
              {" · Most titled: "}
              <span className="text-[var(--text)] font-medium">{hub.most_decorated[0].cur_name}</span>
              {" "}({hub.most_decorated[0].champion_count})
            </>
          )}
        </p>
      </header>

      {navItems.length > 1 && <HubNav items={navItems} />}

      {hasGroups && liveComp && <LiveCompGroups comp={liveComp} season={hub.current_season} />}

      {hasFixtures && liveComp && <LiveCompFixtures comp={liveComp} season={hub.current_season} />}

      {hasCurrent && (
        <div id="current">
          <CurrentSeasonBracket
            entries={hub.current_entries}
            season={hub.current_season}
            label={hub.short_label}
          />
        </div>
      )}

      <div id="finals">
        <ChampionsTable hub={hub} />
      </div>

      {hub.most_decorated.length > 0 && (
        <div id="most-decorated">
          <MostDecoratedTable rows={hub.most_decorated} />
        </div>
      )}
    </main>
  );
}

// ---------- Sub-components ----------

function ColorBall({ slug, name }: { slug: string | null; name: string }) {
  const m = monogramForFootball(name, slug ?? undefined);
  return (
    <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>
  );
}


function ContinentalHubView({ hub }: { hub: NonNullable<ReturnType<typeof getEuropeanTournamentHub>> }) {
  const sections = hub.sections ?? [];
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-3">
        <Link href="/teams/football/tournaments" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          <span aria-hidden>&larr;</span>
          Back to Tournaments
        </Link>
      </div>
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/football" className="hover:underline">Club Football</Link>{" / "}
        <Link href="/teams/football/tournaments" className="hover:underline">Tournaments</Link>{" / "}
        <span>{hub.short_label}</span>
      </nav>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.label}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] max-w-3xl">{hub.era_notes}</p>
      </header>
      <ContinentalTable sections={sections} />
    </main>
  );
}

function ChampionsTable({ hub }: { hub: NonNullable<ReturnType<typeof getEuropeanTournamentHub>> }) {
  if (hub.champions.length === 0) {
    return (
      <section
        className="rounded-xl border p-5 mb-6"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-base font-semibold">All-time finals</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">No final data on file.</p>
      </section>
    );
  }
  // Join finalists to champions by (year, competition) so each row shows both
  // sides of the final. Keying on year alone breaks when two distinct
  // competitions share the same year (e.g. 2025 CWC and 2025-26 Intercontinental Cup).
  const runnersUpByKey = new Map<string, typeof hub.finalists>();
  for (const f of hub.finalists) {
    const key = `${f.year}|${f.competition ?? ""}`;
    const list = runnersUpByKey.get(key) ?? [];
    list.push(f);
    runnersUpByKey.set(key, list);
  }
  // Precompute the champion/runner-up pairing once so both the mobile card
  // list and the desktop table render from the exact same rows (the shift()
  // above is stateful, so it can only run a single pass over hub.champions).
  const finalRows = hub.champions.map((c, i) => {
    const ruList = runnersUpByKey.get(`${c.year}|${c.competition ?? ""}`);
    const runnerUp = ruList && ruList.length > 0 ? ruList.shift()! : null;
    return { c, i, runnerUp };
  });
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">All-time finals</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Most recent first. Club links open the canonical Club Football page where one is available.
      </p>

      {/* Mobile: one card per final instead of a 4-column table. Same
          finalRows pairing as the desktop table below. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        {finalRows.map(({ c, i, runnerUp }) => (
          <div
            key={`${c.year}-${i}-card`}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tabular-nums">{hub.calendar_year ? c.year : (c.season ?? c.year)}</span>
              {c.competition && (
                <span className="text-[10px] text-[var(--text-dim)] truncate">{c.competition}</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Champion</div>
                <span className="inline-flex items-center gap-1.5">
                  <TeamCrest name={c.cur_name} size={18} fallback={<ColorBall slug={c.slug} name={c.cur_name} />} />
                  {c.slug ? (
                    <Link href={`/teams/football/${c.slug}`} className="hover:underline font-medium">
                      {c.cur_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{c.cur_name}</span>
                  )}
                </span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                {runnerUp ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                    <TeamCrest name={runnerUp.cur_name} size={18} fallback={<ColorBall slug={runnerUp.slug} name={runnerUp.cur_name} />} />
                    {runnerUp.slug ? (
                      <Link href={`/teams/football/${runnerUp.slug}`} className="hover:underline">
                        {runnerUp.cur_name}
                      </Link>
                    ) : (
                      <span>{runnerUp.cur_name}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[var(--text-dim)]">—</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 pr-3 text-left font-medium whitespace-nowrap">{hub.calendar_year ? "Year" : "Season"}</th>
              <th className="py-2 px-2 text-left font-medium">Competition</th>
              <th className="py-2 px-2 text-left font-medium">Champion</th>
              <th className="py-2 px-2 text-left font-medium">Runner-up</th>
            </tr>
          </thead>
          <tbody>
            {finalRows.map(({ c, i, runnerUp }) => (
              <tr key={`${c.year}-${i}`} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{hub.calendar_year ? c.year : (c.season ?? c.year)}</td>
                <td className="py-1.5 px-2 text-xs text-[var(--text-muted)] whitespace-nowrap">{c.competition ?? "—"}</td>
                <td className="py-1.5 px-2">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamCrest name={c.cur_name} size={18} fallback={<ColorBall slug={c.slug} name={c.cur_name} />} />
                    {c.slug ? (
                      <Link href={`/teams/football/${c.slug}`} className="hover:underline font-medium">
                        {c.cur_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.cur_name}</span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-[var(--text-muted)]">
                  {runnerUp ? (
                    <span className="inline-flex items-center gap-1.5">
                    <TeamCrest name={runnerUp.cur_name} size={18} fallback={<ColorBall slug={runnerUp.slug} name={runnerUp.cur_name} />} />
                    {runnerUp.slug ? (
                      <Link href={`/teams/football/${runnerUp.slug}`} className="hover:underline">
                        {runnerUp.cur_name}
                      </Link>
                    ) : (
                      <span>{runnerUp.cur_name}</span>
                    )}
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
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

// ---------- Live bracket (NBA/NHL-style alive vs eliminated) ----------

type BracketRound = {
  key: string;
  label: string;
  rnd_match: (r: number | null) => boolean;
};

const BRACKET_ROUNDS: BracketRound[] = [
  { key: "qualifying",   label: "Qualifying",     rnd_match: (r) => r !== null && r >= 6 },
  { key: "group_stage",  label: "Group stage",    rnd_match: (r) => r === 5 },
  { key: "round_of_16",  label: "Round of 16",    rnd_match: (r) => r === 4 },
  { key: "quarterfinal", label: "Quarter-finals", rnd_match: (r) => r === 3 },
  { key: "semifinal",    label: "Semi-finals",    rnd_match: (r) => r === 2 },
  { key: "final",        label: "Final",          rnd_match: (r) => r === 1 },
];

function CurrentSeasonBracket({
  entries,
  season,
  label,
}: {
  entries: EuropeanCurrentEntry[];
  season: string | null;
  label: string;
}) {
  // Frontier round = the smallest deepest_rnd present in the cohort. Rnd# 1
  // is the final, so "smaller is deeper into the tournament." Clubs whose
  // deepest_rnd matches the frontier are still alive if the frontier round
  // hasn't been decided (no trophy_won = true row in their bucket).
  const frontierRnd = entries
    .map((e) => e.deepest_rnd)
    .filter((r): r is number => r !== null)
    .reduce<number | null>((min, r) => (min === null || r < min ? r : min), null);

  const champion = entries.find((e) => e.trophy === true) ?? null;

  // Pre-compute clubs per round bucket. The frontier bucket gets special
  // treatment: if a champion exists, runner-ups go in "eliminated"; if not,
  // both finalists go in "alive".
  function classifyForRound(round: BracketRound): {
    alive: EuropeanCurrentEntry[];
    eliminated: EuropeanCurrentEntry[];
  } {
    const inBucket = entries.filter((e) => round.rnd_match(e.deepest_rnd));
    if (round.rnd_match(frontierRnd)) {
      // Frontier round: alive vs eliminated split depends on whether the
      // round has been decided (a club in this bucket has trophy = true).
      if (champion) {
        return {
          alive: inBucket.filter((e) => e.trophy === true),
          eliminated: inBucket.filter((e) => e.trophy !== true),
        };
      }
      return { alive: inBucket, eliminated: [] };
    }
    // Past round: every club whose deepest = this round was eliminated here
    // (they didn't progress further; otherwise their deepest_rnd would be
    // smaller and they'd surface in a later row).
    return { alive: [], eliminated: inBucket };
  }

  const rows = BRACKET_ROUNDS.map((round) => ({
    round,
    ...classifyForRound(round),
  })).filter((r) => r.alive.length > 0 || r.eliminated.length > 0);

  // Stats summary.
  const aliveCount = entries.filter((e) => {
    if (e.trophy) return false;
    return e.deepest_rnd === frontierRnd;
  }).length + (champion ? 1 : 0);
  const totalCount = entries.length;

  return (
    <section className="mb-8">
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{season ?? ""} {label}</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {champion ? (
              <>Champion crowned. {totalCount} clubs entered.</>
            ) : (
              <>{aliveCount} club{aliveCount === 1 ? "" : "s"} still alive of {totalCount} entered. Round-by-round view; no match scores in this surface.</>
            )}
          </p>
        </div>
      </header>
      <div className="rounded-xl border p-4 space-y-2" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        {rows.map(({ round, alive, eliminated }) => (
          <RoundRow
            key={round.key}
            label={round.label}
            alive={alive}
            eliminated={eliminated}
            isFinal={round.key === "final"}
            champion={champion}
          />
        ))}
      </div>
    </section>
  );
}

function RoundRow({
  label,
  alive,
  eliminated,
  isFinal,
  champion,
}: {
  label: string;
  alive: EuropeanCurrentEntry[];
  eliminated: EuropeanCurrentEntry[];
  isFinal: boolean;
  champion: EuropeanCurrentEntry | null;
}) {
  return (
    <div className="border-l-2 pl-3 py-2" style={{ borderColor: "var(--border)" }}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5 flex items-baseline gap-2">
        <span>{label}</span>
        <span className="text-[var(--text-dim)] tabular-nums">
          {alive.length > 0 && `${alive.length} ${isFinal && champion ? "champion" : "alive"}`}
          {alive.length > 0 && eliminated.length > 0 && ", "}
          {eliminated.length > 0 && `${eliminated.length} out`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {alive.map((e) => (
          <ClubChip
            key={e.cur_name}
            entry={e}
            tone={isFinal && champion && e.cur_name === champion.cur_name ? "champion" : "alive"}
          />
        ))}
        {eliminated.map((e) => (
          <ClubChip key={e.cur_name} entry={e} tone="eliminated" />
        ))}
      </div>
    </div>
  );
}

function ClubChip({
  entry,
  tone,
}: {
  entry: EuropeanCurrentEntry;
  tone: "alive" | "eliminated" | "champion";
}) {
  const inner = <span>{entry.cur_name}</span>;
  const baseClass =
    "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full whitespace-nowrap transition-opacity";

  if (tone === "champion") {
    const node = (
      <span
        className={`${baseClass} font-semibold`}
        style={{ background: "rgba(212,175,55,0.22)", color: "#d4af37" }}
        title="Champion"
      >
        <span aria-hidden>★</span>
        {inner}
      </span>
    );
    return entry.slug ? <Link href={`/teams/football/${entry.slug}`} className="hover:opacity-85">{node}</Link> : node;
  }
  if (tone === "alive") {
    const node = (
      <span
        className={`${baseClass} font-semibold`}
        style={{ background: "rgba(16,185,129,0.18)", color: "#10b981" }}
        title="Still alive"
      >
        {inner}
      </span>
    );
    return entry.slug ? <Link href={`/teams/football/${entry.slug}`} className="hover:opacity-85">{node}</Link> : node;
  }
  const node = (
    <span
      className={`${baseClass} border opacity-65 hover:opacity-100`}
      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      title="Eliminated at this round"
    >
      {inner}
    </span>
  );
  return entry.slug ? <Link href={`/teams/football/${entry.slug}`}>{node}</Link> : node;
}
