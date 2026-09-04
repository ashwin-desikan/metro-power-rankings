import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { TableScroll } from "@/app/_shared/TableScroll";
import { DivergingBar } from "@/app/_shared/DataBar";
import {
  getNflExpectation,
  getNflExpectationSeason,
  getNflExpectationTeams,
  type GameRow,
} from "@/lib/nflExpectation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// One season of the expectation ledger: the game log with what each result was
// supposed to be, and the season's teams ranked by wins against expectation.
// Data comes from the per-season shard (fetched on demand, ISR) — this page is
// deliberately thin so 106 of them cost almost nothing.

export const revalidate = 86400;
export const dynamicParams = true;

const FIRST_SEASON = 1920;
const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const card: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
// Validated diverging tokens; see globals.css. Never a raw hex.
const UP = "var(--div-pos)";
const DOWN = "var(--div-neg)";

export async function generateStaticParams() {
  // Prerender the recent decade; the other ~95 render on demand and cache.
  const out: { season: string }[] = [];
  for (let s = 2025; s >= 2016; s--) out.push({ season: String(s) });
  return out;
}

function parseSeason(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= FIRST_SEASON && n <= 2100 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ season: string }>;
}): Promise<Metadata> {
  const { season } = await params;
  const n = parseSeason(season);
  const title = n ? `The ${n} NFL season against expectation` : "Season not found";
  const description = n
    ? `Every game of the ${n} NFL season scored against its pre-game win probability: the results nobody saw coming, and each team's wins against expectation.`
    : "This season is outside the expectation ledger.";
  return {
    title,
    description,
    alternates: { canonical: `/teams/nfl/expectation/${season}` },
    openGraph: {
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${BASE_URL}/teams/nfl/expectation/${season}`,
      type: "website",
    },
  };
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function signed(n: number, dp = 2) {
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}`;
}

/** The winner's pre-game probability, from the home-side model number. */
function winnerProb(g: GameRow): number | null {
  if (!g.model || !g.result || g.result === "T") return null;
  return g.result === "H" ? g.model.pH : 1 - g.model.pH;
}

export default async function NflExpectationSeasonPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: raw } = await params;
  const season = parseSeason(raw);
  if (season == null) notFound();

  const [file, teams, index] = await Promise.all([
    getNflExpectationSeason(season),
    getNflExpectationTeams(),
    getNflExpectation(),
  ]);
  if (!file || !file.games?.length) notFound();

  const summary = index?.seasons.find((s) => s.season === season) ?? null;
  const seasonSpan = index?.meta.seasons ?? [FIRST_SEASON, season];
  const prev = season - 1 >= seasonSpan[0] ? season - 1 : null;
  const next = season + 1 <= seasonSpan[1] ? season + 1 : null;

  const teamRows = (teams?.rows ?? [])
    .filter((r) => r.season === season && r.wae != null)
    .sort((a, b) => (b.wae ?? 0) - (a.wae ?? 0));
  // Wins vs expected is this board's argument (teams are sorted desc by
  // it) and is genuinely signed, so it takes a DivergingBar. colMax is the
  // max absolute value, computed once over the full teamRows set.
  const teamRowsColMax = Math.max(...teamRows.map((r) => Math.abs(r.wae ?? 0)), 0.0001);

  const games = [...file.games].sort((a, b) =>
    (a.date ?? "") < (b.date ?? "") ? -1 : (a.date ?? "") > (b.date ?? "") ? 1 : 0,
  );
  const graded = games.filter((g) => g.result);
  const upsets = games
    .map((g) => ({ g, p: winnerProb(g) }))
    .filter((x): x is { g: GameRow; p: number } => x.p != null)
    .sort((a, b) => a.p - b.p)
    .slice(0, 5);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-dim)] mb-4">
        <Link href="/teams/nfl" className="hover:underline">NFL</Link>
        <span className="mx-1.5">/</span>
        <Link href="/teams/nfl/expectation" className="hover:underline">Expectation</Link>
        <span className="mx-1.5">/</span>
        <span>{season}</span>
      </nav>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          The expectation ledger
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          The {season} season, against expectation
        </h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Every game of {season} scored against the chance it was given beforehand: the same axis
          that runs from 1920 to this weekend&apos;s picks.
        </p>
        <div className="flex gap-3 mt-4 text-sm" style={mono}>
          {prev != null && (
            <Link href={`/teams/nfl/expectation/${prev}`} className="text-[var(--accent)] hover:underline">
              &larr; {prev}
            </Link>
          )}
          {next != null && (
            <Link href={`/teams/nfl/expectation/${next}`} className="text-[var(--accent)] hover:underline">
              {next} &rarr;
            </Link>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Games</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={mono}>{graded.length}</div>
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Model Brier</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={mono}>
            {summary?.model_brier?.toFixed(4) ?? "—"}
          </div>
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Market Brier</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={mono}>
            {summary?.market_brier?.toFixed(4) ?? "—"}
          </div>
          {summary && summary.market_games === 0 ? (
            <div className="text-xs text-[var(--text-muted)] mt-1">no usable spreads this season</div>
          ) : null}
        </div>
        <div className="rounded-xl border p-4" style={card}>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Longest odds beaten</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={mono}>
            {upsets[0] ? pct(upsets[0].p) : "—"}
          </div>
          {upsets[0] ? (
            <div className="text-xs text-[var(--text-muted)] mt-1 truncate">
              {upsets[0].g.result === "H" ? upsets[0].g.home_era : upsets[0].g.away_era}
            </div>
          ) : null}
        </div>
      </section>

      {teamRows.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-1">Teams against expectation</h2>
          <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
            Expected wins are the pre-game probabilities of each team&apos;s own games added up;
            teams are printed under the name they carried in {season}.
          </p>
          <TableScroll className="rounded-xl border" style={card}>
            <table className="w-full text-xs" data-sticky-col="2">
              <thead>
                <tr className="text-[var(--text-dim)] text-left">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Team</th>
                  <th className="py-2 px-3 font-medium text-right">vs expected</th>
                  <th className="py-2 px-3 font-medium text-right">Won</th>
                  <th className="py-2 px-3 font-medium text-right">Expected</th>
                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Metro</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r, i) => (
                  <tr key={r.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={mono}>{i + 1}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      {r.slug ? (
                        <Link href={`/teams/nfl/${r.slug}`} className="text-[var(--accent)] hover:underline">
                          {r.team}
                        </Link>
                      ) : r.team}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <DivergingBar v={r.wae ?? 0} max={teamRowsColMax} dp={2} suffix="" width={132} label="wins against expectation" />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{r.wins}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={mono}>
                      {r.exp_wins?.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">
                      {r.metro_slug ? (
                        <Link href={`/rankings/${r.metro_slug}`} className="hover:underline">{r.metro}</Link>
                      ) : (r.metro ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-1">The game log</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
          Chance is the home side&apos;s pre-game win probability. The five results that beat the
          longest odds of {season} are marked.
        </p>
        <TableScroll className="rounded-xl border max-h-[36rem]" style={card}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-dim)] text-left">
                <th className="py-2 px-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Game</th>
                <th className="py-2 px-3 font-medium text-right">Home chance</th>
                <th className="py-2 px-3 font-medium text-right">Score</th>
                <th className="py-2 px-3 font-medium hidden sm:table-cell">Round</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const shock = upsets.some((u) => u.g.game_id === g.game_id);
                const homeWon = g.result === "H";
                const awayWon = g.result === "A";
                return (
                  <tr key={g.game_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)] whitespace-nowrap" style={mono}>
                      {g.date ?? ""}
                    </td>
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span className={awayWon ? "font-semibold" : ""}>{g.away_era}</span>
                      <span className="text-[var(--text-dim)] mx-1">{g.neutral ? "vs" : "at"}</span>
                      <span className={homeWon ? "font-semibold" : ""}>{g.home_era}</span>
                      {shock ? (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide" style={{ color: UP }}>
                          shock
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>
                      {g.model ? pct(g.model.pH) : ""}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap" style={mono}>
                      {g.score ?? (g.result ? g.result : "")}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">
                      {g.playoff ? (g.round ?? "playoff") : typeof g.week === "number" ? `wk ${g.week}` : g.week ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <p className="text-[var(--text-muted)] text-sm">
        Back to{" "}
        <Link href="/teams/nfl/expectation" className="text-[var(--accent)] hover:underline">
          the full century
        </Link>
        , or score yourself on the same axis in{" "}
        <Link href="/play/picks" className="text-[var(--accent)] hover:underline">
          Citizen of Nowhere Picks
        </Link>
        .
      </p>
    </main>
  );
}
