import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";

// The finals / playoffs bracket, shared by the AFL and NRL hubs (via
// app/teams/_footy/FootyFinalsBracket.tsx) and by the NFL hub (via
// app/teams/nfl/NflPlayoffsBracket.tsx). One component, one look.
//
// It was written for the AFL and NRL and moved here unchanged when the NFL
// wanted the same idiom in January. Everything league-specific that used to be
// read off FootyCopy is now a prop, and the two wrappers supply exactly the
// strings the old component built for itself, so the AFL and NRL hubs render
// the same markup they always did.
//
// Deliberately NOT a symmetric knockout tree: the Australian codes run a
// double-chance system (a qualifying-final loser drops into the semis rather
// than out), so a World-Cup-style tree would draw lines the format does not
// have. Round columns are the honest rendering for both codes and for the NFL;
// each card is a real fixture with venue and (once played) score.
//
// ESPN reports scores as 0-0 before the first whistle, so `state === "pre"`
// renders the fixture, never a scoreline. TBC slots appear as soon as ESPN
// lists the fixture shell, which it does before the draw resolves.

/** A club as the bracket needs it: identity, crest name and monogram colours. */
export type BracketTeam = {
  slug: string;
  name: string;
  /** Monogram background. */
  color: string;
  /** Monogram text colour, computed by the caller against `color`. */
  fg: string;
  /** Monogram inset border. */
  color2: string;
  abbr: string;
};

/**
 * One side of a fixture. `null` = TBC (ESPN lists the shell before the draw).
 * `seed` is optional: the NFL carries one, the Australian codes do not, and a
 * missing seed renders nothing at all.
 */
export type BracketSide = {
  name: string;
  slug: string | null;
  score: number | null;
  winner: boolean;
  seed?: number | null;
} | null;

export type BracketGame = {
  week: number | null;
  code: string | null;
  round: string | null;
  date: string | null;
  venue: string | null;
  /** Optional: a Super Bowl or a Grand Final at a venue neither side owns. */
  neutral?: boolean;
  home: BracketSide;
  away: BracketSide;
  state: "pre" | "in" | "post";
  completed: boolean;
  winner: "home" | "away" | null;
};

export type BracketBundle = {
  meta: { league: string; season: number; generated_at: string; complete: boolean };
  weeks: { week: number; label: string; games: BracketGame[] }[];
  premier: { name: string; slug: string | null } | null;
};

function Monogram({ f, size = 20 }: { f: BracketTeam; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{
        background: f.color, color: f.fg,
        width: size, height: size * 0.62, fontSize: f.abbr.length > 2 ? 8 : 10,
        letterSpacing: "0.02em", boxShadow: `inset 0 0 0 1.5px ${f.color2}`,
      }}
    >
      {f.abbr}
    </span>
  );
}

function gameDate(iso: string | null, locale: string, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { timeZone, weekday: "short", day: "numeric", month: "short" });
}

function SideRow({ side, hrefBase, bySlug, oddsPct, showScore, won, lost }: {
  side: BracketSide; hrefBase: string; bySlug: Map<string, BracketTeam>;
  oddsPct: string | null; showScore: boolean; won: boolean; lost: boolean;
}) {
  if (!side) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-sm italic text-[var(--text-dim)]">TBC</span>
      </div>
    );
  }
  const f = side.slug ? bySlug.get(side.slug) : undefined;
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${lost ? "opacity-55" : ""}`}>
      <span className="flex items-center gap-2 min-w-0">
        {/* The seed is an element, not text, so a league that carries none
            (AFL, NRL) renders exactly the row it always rendered. */}
        {side.seed != null ? (
          <span className="text-[10px] tabular-nums text-[var(--text-dim)] flex-shrink-0 w-3 text-right">{side.seed}</span>
        ) : null}
        {f && <TeamCrest name={f.name} size={18} fallback={<Monogram f={f} size={18} />} />}
        <span className={`text-sm truncate ${won ? "font-semibold" : ""}`}>
          {f ? (
            <Link href={`${hrefBase}/${f.slug}`} className="hover:text-[var(--accent)] transition-colors">
              {f.name}
            </Link>
          ) : (
            side.name
          )}
        </span>
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        {oddsPct !== null && !showScore && (
          <span className="text-[10px] tabular-nums text-[var(--text-dim)]">{oddsPct}</span>
        )}
        {showScore && side.score !== null && (
          <span className={`text-sm tabular-nums ${won ? "font-bold" : "text-[var(--text-muted)]"}`}>{side.score}</span>
        )}
        {won && <span className="text-[10px]" style={{ color: "rgb(34,197,94)" }}>✓</span>}
      </span>
    </div>
  );
}

function GameCard({ g, hrefBase, bySlug, odds, seasonDone, locale, timeZone }: {
  g: BracketGame; hrefBase: string; bySlug: Map<string, BracketTeam>;
  odds: Map<string, string> | null; seasonDone: boolean; locale: string; timeZone: string;
}) {
  const showScore = g.state !== "pre";
  const pct = (s: BracketSide) =>
    odds && !seasonDone && s?.slug && odds.has(s.slug) ? odds.get(s.slug)! : null;
  return (
    <div className="rounded-lg border p-2.5" style={{ background: "var(--bg-card)", borderColor: g.completed ? "var(--border)" : "rgba(34,197,94,0.35)" }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
          {g.code ? `${g.code} · ${g.round}` : g.round ?? "Final"}
        </span>
        <span className="text-[10px] text-[var(--text-dim)] truncate">{gameDate(g.date, locale, timeZone)}</span>
      </div>
      <SideRow side={g.home} hrefBase={hrefBase} bySlug={bySlug} oddsPct={pct(g.home)} showScore={showScore} won={g.winner === "home"} lost={g.completed && g.winner === "away"} />
      <SideRow side={g.away} hrefBase={hrefBase} bySlug={bySlug} oddsPct={pct(g.away)} showScore={showScore} won={g.winner === "away"} lost={g.completed && g.winner === "home"} />
      {/* One expression, not two, so a league with no `neutral` field renders
          the same single text node it always did. */}
      {g.venue && <div className="mt-1 text-[10px] text-[var(--text-dim)] truncate">{g.neutral ? `${g.venue} · neutral site` : g.venue}</div>}
    </div>
  );
}

export default function FinalsBracket({
  bundle, teams, hrefBase, anchorId, heading, blurb, oddsNote, odds,
  championEyebrow, footnoteLead, footnoteTail, locale, timeZone,
}: {
  bundle: BracketBundle;
  teams: BracketTeam[];
  /** "/teams/afl", "/teams/nfl": the slug is appended. */
  hrefBase: string;
  anchorId: string;
  /** Heading text. Pass a fragment so the caller owns its exact wording. */
  heading: React.ReactNode;
  /** The one clause under the heading explaining the format. */
  blurb: string;
  /** Appended to `blurb` when odds are showing; "" otherwise. */
  oddsNote: string;
  /** slug -> formatted title-odds percentage, or null for no odds column. */
  odds: Map<string, string> | null;
  championEyebrow: React.ReactNode;
  footnoteLead: string;
  footnoteTail: string;
  locale: string;
  timeZone: string;
}) {
  const bySlug = new Map(teams.map((f) => [f.slug, f]));
  const premierF = bundle.premier?.slug ? bySlug.get(bundle.premier.slug) : undefined;
  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h2 id={anchorId} className="text-xl font-bold">
          {heading}
        </h2>
        {!bundle.meta.complete && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />
            Live
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-dim)] mb-4">
        {blurb}
        {oddsNote}
      </p>

      {bundle.meta.complete && bundle.premier && (
        <div className="rounded-xl border p-4 mb-4 flex items-center gap-3" style={{ background: "var(--bg-card)", borderColor: "rgba(34,197,94,0.45)" }}>
          {premierF && <TeamCrest name={premierF.name} size={34} fallback={<Monogram f={premierF} size={34} />} />}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">
              {championEyebrow}
            </div>
            <div className="text-lg font-bold">
              {premierF ? (
                <Link href={`${hrefBase}/${premierF.slug}`} className="hover:text-[var(--accent)] transition-colors">
                  {premierF.name}
                </Link>
              ) : (
                bundle.premier.name
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        {/* Each week is a fixed-width column that later rounds add to, never
            a column that stretches to fill the row: with one week on file
            (the NRL's qualifying finals, 2026-09-08) flex-1 spread four cards
            across the whole desktop width while the AFL's four weeks sat at
            card size. Same width whatever the count. */}
        <div className="flex gap-3" style={{ minWidth: `${bundle.weeks.length * 240}px` }}>
          {bundle.weeks.map((w) => (
            <div key={w.week} className="w-[240px] flex-none">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
                {w.label}
              </div>
              <div className="flex flex-col gap-2">
                {w.games.map((g, i) => (
                  <GameCard key={`${g.code ?? "g"}-${i}`} g={g} hrefBase={hrefBase} bySlug={bySlug} odds={odds} seasonDone={bundle.meta.complete} locale={locale} timeZone={timeZone} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-1">
        {footnoteLead}{" "}
        {new Date(bundle.meta.generated_at).toLocaleDateString(locale, { timeZone, day: "numeric", month: "short" })}
        {footnoteTail}
      </p>
    </section>
  );
}
