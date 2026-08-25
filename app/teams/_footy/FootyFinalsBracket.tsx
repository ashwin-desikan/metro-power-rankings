import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { fgFor, type FootyFranchise } from "@/lib/_footy";
import type { FootyFinalsBundle, FootyFinalsGame, FootyFinalsSide } from "@/lib/footyFinals";
import { fmtOdds, simBySlug, type SeasonSimFile } from "@/lib/seasonSim";
import type { FootyCopy } from "./config";

// Finals bracket for the AFL / NRL hubs, fed by public/data/{afl,nrl}/
// finals.json (scripts/ingest/footy_finals.py). Deliberately NOT a symmetric
// knockout tree: both leagues run a double-chance system (a qualifying-final
// loser drops into the semis rather than out), so a World-Cup-style tree
// would draw lines the format does not have. Round columns are the honest
// rendering; each card is a real fixture with venue and (once played) score.
//
// ESPN reports scores as 0-0 before the bounce, so `state === "pre"` renders
// the fixture, never a scoreline. TBC slots appear as soon as ESPN lists the
// fixture shell, which it does before the draw resolves.

function Monogram({ f, size = 20 }: { f: FootyFranchise; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{
        background: f.color, color: f.color.startsWith("#") ? fgFor(f.color) : "#fff",
        width: size, height: size * 0.62, fontSize: f.abbr.length > 2 ? 8 : 10,
        letterSpacing: "0.02em", boxShadow: `inset 0 0 0 1.5px ${f.color2}`,
      }}
    >
      {f.abbr}
    </span>
  );
}

function gameDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short" });
}

function SideRow({ side, league, bySlug, oddsPct, showScore, won, lost }: {
  side: FootyFinalsSide; league: string; bySlug: Map<string, FootyFranchise>;
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
        {f && <TeamCrest name={f.name} size={18} fallback={<Monogram f={f} size={18} />} />}
        <span className={`text-sm truncate ${won ? "font-semibold" : ""}`}>
          {f ? (
            <Link href={`/teams/${league}/${f.slug}`} className="hover:text-[var(--accent)] transition-colors">
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

function GameCard({ g, league, bySlug, odds, seasonDone }: {
  g: FootyFinalsGame; league: string; bySlug: Map<string, FootyFranchise>;
  odds: Map<string, { p_title: number }> | null; seasonDone: boolean;
}) {
  const showScore = g.state !== "pre";
  const pct = (s: FootyFinalsSide) =>
    odds && !seasonDone && s?.slug && odds.has(s.slug) ? fmtOdds(odds.get(s.slug)!.p_title) : null;
  return (
    <div className="rounded-lg border p-2.5" style={{ background: "var(--bg-card)", borderColor: g.completed ? "var(--border)" : "rgba(34,197,94,0.35)" }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
          {g.code ? `${g.code} · ${g.round}` : g.round ?? "Final"}
        </span>
        <span className="text-[10px] text-[var(--text-dim)] truncate">{gameDate(g.date)}</span>
      </div>
      <SideRow side={g.home} league={league} bySlug={bySlug} oddsPct={pct(g.home)} showScore={showScore} won={g.winner === "home"} lost={g.completed && g.winner === "away"} />
      <SideRow side={g.away} league={league} bySlug={bySlug} oddsPct={pct(g.away)} showScore={showScore} won={g.winner === "away"} lost={g.completed && g.winner === "home"} />
      {g.venue && <div className="mt-1 text-[10px] text-[var(--text-dim)] truncate">{g.venue}</div>}
    </div>
  );
}

export default function FootyFinalsBracket({ copy, bundle, franchises, sim }: {
  copy: FootyCopy; bundle: FootyFinalsBundle; franchises: FootyFranchise[];
  sim?: SeasonSimFile | null;
}) {
  const bySlug = new Map(franchises.map((f) => [f.slug, f]));
  // The season-sim freshness gate (simIsCurrent) requires regular-season
  // games remaining, which is exactly wrong during finals; the bracket keeps
  // its own 10-day window instead, and drops odds once the premier is known.
  const simFresh =
    sim && sim.table.length > 0 &&
    Date.now() - new Date(`${sim.meta.generated_at}T00:00:00Z`).getTime() < 10 * 24 * 3600 * 1000;
  const odds = simFresh
    ? (simBySlug(sim) as unknown as Map<string, { p_title: number }>)
    : null;
  const premierF = bundle.premier?.slug ? bySlug.get(bundle.premier.slug) : undefined;
  const doubleChance =
    copy.league === "afl"
      ? "Top-10 wildcard format: 7th–10th play off for the last two finals spots; qualifying-final losers get a second chance in the semi finals."
      : "Final-eight system: qualifying-final losers get a second chance in the semi finals; elimination-final losers are out.";
  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h2 id="finals-bracket" className="text-xl font-bold">
          {bundle.meta.season} Finals
        </h2>
        {!bundle.meta.complete && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />
            Live
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-dim)] mb-4">
        {doubleChance}
        {odds ? ` Small figures are each club's live ${copy.premierWord.toLowerCase()} odds (20k-sim model, refreshed daily).` : ""}
      </p>

      {bundle.meta.complete && bundle.premier && (
        <div className="rounded-xl border p-4 mb-4 flex items-center gap-3" style={{ background: "var(--bg-card)", borderColor: "rgba(34,197,94,0.45)" }}>
          {premierF && <TeamCrest name={premierF.name} size={34} fallback={<Monogram f={premierF} size={34} />} />}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">
              {bundle.meta.season} {copy.premiersWord}
            </div>
            <div className="text-lg font-bold">
              {premierF ? (
                <Link href={`/teams/${copy.league}/${premierF.slug}`} className="hover:text-[var(--accent)] transition-colors">
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
        <div className="flex gap-3" style={{ minWidth: `${bundle.weeks.length * 240}px` }}>
          {bundle.weeks.map((w) => (
            <div key={w.week} className="flex-1 min-w-[228px]">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)] mb-2">
                {w.label}
              </div>
              <div className="flex flex-col gap-2">
                {w.games.map((g, i) => (
                  <GameCard key={`${g.code ?? "g"}-${i}`} g={g} league={copy.league} bySlug={bySlug} odds={odds} seasonDone={bundle.meta.complete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-1">
        Fixtures and scores from ESPN, refreshed several times daily during the finals · last updated{" "}
        {new Date(bundle.meta.generated_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" })}
        . Later rounds appear as the draw resolves.
      </p>
    </section>
  );
}
