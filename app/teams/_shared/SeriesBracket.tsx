import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { Disclosure } from "@/app/_shared/Disclosure";
import LocalTime from "@/app/sports/standings/LocalTime";
import type { PlayoffBundle, PlayoffRound, PlayoffSeries, PlayoffSide, PlayoffGame } from "@/lib/playoffSeries";

// SeriesBracket -- a best-of-N playoff bracket, one card per SERIES (not per
// game), for the MLB and WNBA hubs. Sibling to app/teams/_shared/FinalsBracket
// (the AFL/NRL/NFL week-by-week idiom) and app/teams/nba/PlayoffBracket (the
// pairings-free survival ladder): neither fits here, because MLB and WNBA
// postseason IS a sequence of matchups with a running score, not a set of
// fixtures or a bracket with unknown pairings.
//
// MLB runs two brackets (AL, NL) that converge in the World Series; the WNBA
// runs one. A round with brackets stacks AL above NL within its column,
// rather than side-by-side, so the same markup serves both leagues and the
// column width never doubles. The World Series / Finals round carries no
// bracket label of its own; its round name already says what it is.
//
// Desktop draws round columns, horizontally scrollable in their own box, the
// FinalsBracket idiom. Phones get a second, vertically-stacked tree (the
// MlbStandings / WnbaPage idiom of a hidden sm:block table beside an sm:hidden
// card list) so nothing here defeats the sitewide "cap by count, never a
// nested scroll box" rule for vertical length. A round list with more than
// two rounds wraps each round in a Disclosure so a reader lands on the
// column that matters rather than scrolling past three closed-out rounds
// to reach it.

const CARD_W = 250;

function seriesLeader(s: PlayoffSeries): "high" | "low" | null {
  if (s.high.wins === s.low.wins) return null;
  return s.high.wins > s.low.wins ? "high" : "low";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

function Monogram({ side, size = 18 }: { side: PlayoffSide; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{
        background: "var(--bg-card-hover)", color: "var(--text-muted)",
        width: size, height: size * 0.62, fontSize: side.abbr.length > 2 ? 8 : 10,
        letterSpacing: "0.02em", boxShadow: "inset 0 0 0 1.5px var(--border)",
      }}
    >
      {side.abbr}
    </span>
  );
}

function GameChip({ g }: { g: PlayoffGame }) {
  if (g.state === "post" && g.home_score !== null && g.away_score !== null) {
    return (
      <span
        className="text-[10px] tabular-nums px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}
        title={`${g.away} ${g.away_score} at ${g.home} ${g.home_score}${g.venue ? ` · ${g.venue}` : ""}`}
      >
        G{g.num} {g.home_score}-{g.away_score}
      </span>
    );
  }
  if (g.state === "in" && g.home_score !== null && g.away_score !== null) {
    return (
      <span
        className="text-[10px] tabular-nums px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}
        title={`${g.away} ${g.away_score} at ${g.home} ${g.home_score} · in progress`}
      >
        G{g.num} {g.home_score}-{g.away_score}
      </span>
    );
  }
  return (
    <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded flex-shrink-0 text-[var(--text-dim)]" style={{ background: "var(--bg-card-hover)" }}>
      G{g.num} <LocalTime iso={g.date} fallback={fmtDate(g.date)} weekday withTime={false} />
    </span>
  );
}

function SideRow({
  side, leader, decided, teamHref, crestName,
}: {
  side: PlayoffSide; leader: boolean; decided: boolean;
  teamHref: (slug: string) => string; crestName?: (side: PlayoffSide) => string;
}) {
  const lost = decided && !leader;
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${lost ? "opacity-60" : ""}`}>
      <span className="flex items-center gap-2 min-w-0">
        {side.seed != null ? (
          <span className="text-[10px] tabular-nums text-[var(--text-dim)] flex-shrink-0 w-3 text-right">{side.seed}</span>
        ) : null}
        <TeamCrest name={crestName ? crestName(side) : side.name} size={18} fallback={<Monogram side={side} />} />
        <span className={`text-sm truncate ${leader ? "font-semibold" : ""}`}>
          {side.slug ? (
            <Link href={teamHref(side.slug)} className="hover:text-[var(--accent)] transition-colors">
              {side.name}
            </Link>
          ) : (
            side.name
          )}
        </span>
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`text-sm tabular-nums ${leader ? "font-bold" : "text-[var(--text-muted)]"}`}>{side.wins}</span>
        {decided && leader && <span className="text-[10px]" style={{ color: "rgb(34,197,94)" }}>✓</span>}
      </span>
    </div>
  );
}

function SeriesCard({
  s, teamHref, crestName,
}: {
  s: PlayoffSeries; teamHref: (slug: string) => string; crestName?: (side: PlayoffSide) => string;
}) {
  const leader = seriesLeader(s);
  const decided = s.state === "post" && s.winner !== null;
  return (
    <div
      className="rounded-lg border p-2.5"
      style={{ background: "var(--bg-card)", borderColor: decided ? "var(--border)" : "rgba(34,197,94,0.35)" }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
          Best of {s.best_of}
        </span>
        {s.state === "in" && (
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgb(34,197,94)" }}>Live</span>
        )}
      </div>
      <SideRow side={s.high} leader={leader === "high" || s.winner === "high"} decided={decided} teamHref={teamHref} crestName={crestName} />
      <SideRow side={s.low} leader={leader === "low" || s.winner === "low"} decided={decided} teamHref={teamHref} crestName={crestName} />
      {s.summary && <div className="mt-1 text-[10px] text-[var(--text-dim)] truncate">{s.summary}</div>}
      {s.games.length > 0 && (
        <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5">
          {s.games.map((g) => <GameChip key={g.espn_id || g.num} g={g} />)}
        </div>
      )}
    </div>
  );
}

function TbcCard() {
  return (
    <div className="rounded-lg border p-2.5 border-dashed" style={{ borderColor: "var(--border)" }}>
      <span className="text-sm italic text-[var(--text-dim)]">TBC</span>
    </div>
  );
}

function BracketLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mt-2 mb-1 first:mt-0">
      {label}
    </div>
  );
}

const BRACKET_NAME: Record<string, string> = { AL: "American League", NL: "National League" };

function RoundBody({
  round, teamHref, crestName,
}: {
  round: PlayoffRound; teamHref: (slug: string) => string; crestName?: (side: PlayoffSide) => string;
}) {
  if (round.series.length === 0) return <TbcCard />;
  const brackets = [...new Set(round.series.map((s) => s.bracket))];
  const grouped = brackets.length > 1;
  return (
    <div className="flex flex-col gap-2">
      {(grouped ? (["AL", "NL"] as const) : [null]).map((bk) => {
        const rows = round.series.filter((s) => s.bracket === bk);
        if (rows.length === 0) return null;
        return (
          <div key={bk ?? "single"}>
            {grouped && bk && <BracketLabel label={BRACKET_NAME[bk] ?? bk} />}
            <div className="flex flex-col gap-2">
              {rows.map((s) => <SeriesCard key={s.id} s={s} teamHref={teamHref} crestName={crestName} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SeriesBracket({
  bundle, league, teamHref, crestName,
}: {
  bundle: PlayoffBundle;
  league: "mlb" | "wnba";
  /** "/teams/mlb/yankees" for a given slug. */
  teamHref: (slug: string) => string;
  /** Name TeamCrest looks up, when it differs from the side's own name. */
  crestName?: (side: PlayoffSide) => string;
}) {
  const rounds = bundle.rounds;
  if (rounds.length === 0) return null;
  const hasAction = (r: PlayoffRound) => r.series.some((s) => s.state !== "pre");
  const defaultOpenRound = rounds.find(hasAction)?.key ?? rounds[0]?.key;

  return (
    <div>
      {/* Desktop: round columns, horizontally scrollable in their own box. */}
      <div className="hidden sm:block overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: `${rounds.length * CARD_W}px` }}>
          {rounds.map((round) => (
            <div key={round.key} className="flex-none" style={{ width: `${CARD_W - 10}px` }}>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
                {round.name}
              </div>
              <RoundBody round={round} teamHref={teamHref} crestName={crestName} />
            </div>
          ))}
        </div>
      </div>

      {/* Phone: stacked, each round a Disclosure once there are more than two. */}
      <div className="sm:hidden flex flex-col gap-3">
        {rounds.length > 2
          ? rounds.map((round) => (
              <Disclosure
                key={round.key}
                title={round.name}
                desktopOpen={false}
                defaultOpen={round.key === defaultOpenRound}
              >
                <div className="p-3">
                  <RoundBody round={round} teamHref={teamHref} crestName={crestName} />
                </div>
              </Disclosure>
            ))
          : rounds.map((round) => (
              <div key={round.key}>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
                  {round.name}
                </div>
                <RoundBody round={round} teamHref={teamHref} crestName={crestName} />
              </div>
            ))}
      </div>

      {bundle.meta.complete && bundle.champion && (
        <div
          className="rounded-xl border p-4 mt-3 flex items-center gap-3"
          style={{ background: "var(--bg-card)", borderColor: "rgba(34,197,94,0.45)" }}
        >
          <TeamCrest name={bundle.champion.name} size={32} fallback={<Monogram side={{ ...bundle.champion, seed: null, wins: 0 }} size={32} />} />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">
              {bundle.meta.season} {league === "mlb" ? "World Series champion" : "WNBA champion"}
            </div>
            <div className="text-lg font-bold">
              {bundle.champion.slug ? (
                <Link href={teamHref(bundle.champion.slug)} className="hover:text-[var(--accent)] transition-colors">
                  {bundle.champion.name}
                </Link>
              ) : (
                bundle.champion.name
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        As of {new Date(bundle.meta.generated_at).toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", month: "short" })}, via {bundle.meta.source}.
      </p>
    </div>
  );
}
