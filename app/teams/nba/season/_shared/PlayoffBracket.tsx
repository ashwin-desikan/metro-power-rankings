import Link from "next/link";
import type { CSSProperties } from "react";
import type { NbaEloSeries } from "@/lib/nbaElo";

// One season's postseason, round by round.
//
// 🔴 A BRACKET, NOT A LIST OF RESULTS. The point of a playoff view on a season
// recap is the PATH: who a team had to get through, from what seed, and where
// it stopped. A flat list of series answers "what happened" and hides the run.
// So rounds read left to right on a desktop, earliest first, and each series
// carries both seeds and the series score.
//
// 🔴 THE ROUNDS ARE WHATEVER THE SEASON HAD. The NBA has run three-round and
// four-round postseasons, the field has been 8, 10, 12 and 16 teams, and the
// play-in only exists from 2020. Nothing here assumes a shape: the rounds are
// derived from the data, so 1975 draws three columns and 2026 draws four plus
// a play-in strip. Hardcoding "First Round, Semis, Conf Finals, Finals" would
// be wrong for roughly half the seasons on the site.
//
// The workbook numbers rounds BACKWARDS from the Finals (1 = Finals), which is
// why the sort is descending: it walks from the first round to the last.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

/** The club's name THAT SEASON, falling back to the canonical only when the
 *  workbook has no era-accurate name for the row. */
function eraName(city: string | null, team: string | null, canonical: string): string {
  const era = [city, team].filter(Boolean).join(" ").trim();
  return era || canonical;
}

type Props = {
  bracket: NbaEloSeries[];
  season: number;
  slugByName?: Record<string, string | null>;
  colorByName?: Record<string, string | null>;
};

/**
 * 🔴 DISPLAY THE ERA NAME, LINK ON THE CANONICAL. A 1978 bracket that says
 * "Thunder" is wrong: that club was the Seattle SuperSonics, and the canonical
 * is a JOIN KEY, not a label. `name` is what the reader sees, `slug` is
 * resolved from the canonical so the link still reaches the franchise history.
 * The site already rules this way for championship rows; this page had been
 * showing the canonical everywhere. (Ashwin, 2026-09-17.)
 */
function Team({
  name, seed, won, slug, colour,
}: {
  name: string;
  seed: number | null;
  won: boolean;
  slug: string | null;
  colour: string | null;
}) {
  // 🔴 44px ON A PHONE, THE FULL STANDARD, AND THE COST WAS MEASURED.
  // These started at about 20px. An intermediate 34px was tried first on the
  // reasoning that a bracket is 42 inline links in a dense data view, closer
  // to a table row than a button. Two things killed that: the tap floor is 44
  // and picking 34 is just failing it by less, and the mobile probe's own
  // threshold is 40, so the compromise bought a real ergonomic improvement
  // that no gate could see. Either meet the standard or record a deviation
  // the tooling reports; do not sit between them.
  //
  // The cost was then measured rather than estimated, and the estimate was
  // badly wrong: 6.6 phone screens to 7.0, not the two extra screens the
  // compromise was justified by, while tap targets under 40px went from 31 to
  // 1. The argument for deviating was wrong on the principle AND on the
  // price. Measure the cost before trading a standard away for it.
  const body = (
    <span className="flex items-center gap-1.5 min-w-0 min-h-11 sm:min-h-0">
      <span
        aria-hidden
        className="shrink-0 rounded-sm"
        style={{ background: colour ?? "var(--text-dim)", width: 3, height: 13 }}
      />
      {seed ? (
        <span
          className="text-[10px] tabular-nums text-[var(--text-dim)] w-4 text-right shrink-0"
          style={MONO}
        >
          {seed}
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span
        className={`truncate text-xs ${won ? "font-semibold" : ""}`}
        style={{ color: won ? "var(--text)" : "var(--text-muted)" }}
      >
        {name}
      </span>
    </span>
  );
  return slug ? (
    <Link href={`/teams/nba/${slug}`} className="min-w-0 hover:text-[var(--accent)]">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function PlayoffBracket({
  bracket, season, slugByName = {}, colorByName = {},
}: Props) {
  if (!bracket.length) return null;

  const playIn = bracket.filter((s) => (s.round ?? 0) >= 4.5);
  const main = bracket.filter((s) => (s.round ?? 0) < 4.5);
  if (!main.length) return null;

  // Rounds in play order: the highest workbook number is the earliest round.
  const rounds = [...new Set(main.map((s) => s.round))]
    .filter((r): r is number => r != null)
    .sort((a, b) => b - a);

  const finalRound = Math.min(...rounds);
  const finals = main.filter((s) => s.round === finalRound);
  const champion = finals[0]?.winner ?? null;

  // 🔴 THE TWO SIDES OF A BRACKET ARE THE POINT OF A BRACKET. Rounds used to
  // be the outer grouping, with both conferences stacked inside each column,
  // so the East and the West ran together and a reader could not see the two
  // halves that only meet at the end. Conference is now the outer grouping and
  // the round the inner one: East on top, West underneath, the Finals sitting
  // between them across the divider, which is how the postseason is actually
  // thought about. (Ashwin, 2026-09-17.)
  const confRounds = rounds.filter((r) => r !== finalRound);
  const confs = [...new Set(main.map((s) => s.conf).filter(Boolean))].sort() as string[];

  const Series = ({ s, i }: { s: NbaEloSeries; i: number }) => (
    <div
      key={`${s.winner}-${s.loser}-${i}`}
      className="rounded-lg border px-2 py-1.5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <Team name={eraName(s.winner_city, s.winner_team, s.winner)} seed={s.winner_seed} won
          slug={slugByName[s.winner] ?? null} colour={colorByName[s.winner] ?? null} />
        <span className="text-xs tabular-nums font-semibold shrink-0" style={MONO}>
          {s.w ?? "—"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <Team name={eraName(s.loser_city, s.loser_team, s.loser)} seed={s.loser_seed} won={false}
          slug={slugByName[s.loser] ?? null} colour={colorByName[s.loser] ?? null} />
        <span className="text-xs tabular-nums text-[var(--text-dim)] shrink-0" style={MONO}>
          {s.l ?? "—"}
        </span>
      </div>
    </div>
  );

  /** One conference's run to the final, rounds left to right.
   *
   *  🔴 THE TWO HALVES MIRROR EACH OTHER VERTICALLY, and that is what makes it
   *  read as a bracket rather than as two lists. A real bracket narrows toward
   *  the middle: the top half's later rounds should sink toward the divider
   *  and the bottom half's should stay pinned to it, so both funnel into the
   *  Finals at the right. Left both halves top-aligned and the top one drifts
   *  away from the centre as its columns get shorter, which is exactly what it
   *  looked like. (Ashwin, 2026-09-17.)
   *
   *  `align` is only meaningful once the columns sit side by side, so it is
   *  applied at lg and above; stacked on a phone, there is no middle to
   *  converge on.
   */
  const Half = ({ conf, align }: { conf: string; align: "end" | "start" }) => {
    const mine = main.filter((s) => s.conf === conf);
    if (!mine.length) return null;
    return (
      <section>
        <h3
          className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2"
          style={MONO}
        >
          {conf}
        </h3>
        <div
          className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
            align === "end" ? "lg:items-end" : "lg:items-start"
          }`}
        >
          {confRounds.map((r) => {
            const inRound = mine.filter((s) => s.round === r);
            if (!inRound.length) return null;
            return (
              <div key={r}>
                <h4
                  className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5"
                  style={MONO}
                >
                  {inRound[0]?.round_label ?? `Round ${r}`}
                </h4>
                <div className="space-y-1.5">
                  {inRound.map((s, i) => <Series key={`${s.winner}-${i}`} s={s} i={i} />)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  // The divider is DOTTED rather than solid on purpose: it separates two
  // halves of one competition, it is not a section break between two
  // unrelated things.
  const Divider = () => (
    <div
      aria-hidden
      className="my-5 border-t"
      style={{ borderColor: "var(--border)", borderTopStyle: "dotted", borderTopWidth: 2 }}
    />
  );

  return (
    <div>
      {/* 🔴 THE SHAPE OF A BRACKET IS TWO SIDES MEETING AT THE END, and the
          layout has to say that. The conference rounds fill the left three
          quarters, East above the dotted rule and West below it, so the two
          halves never run together. The Finals sit in their own column at the
          far right, vertically centred against the divider, because that is
          where the two sides converge: they belong to neither conference and
          come after both.
          On a phone the grid collapses and the DOM order is the reading order
          anyway: East, rule, West, then the Finals last, which is also
          chronological. (Ashwin, 2026-09-17.) */}
      <div className="lg:grid lg:grid-cols-4 lg:gap-5 lg:items-center">
        <div className="lg:col-span-3">
          {/* Top half sinks toward the divider, bottom half rises to meet it. */}
          {confs[0] ? <Half conf={confs[0]} align="end" /> : null}
          {confs[0] && confs[1] ? <Divider /> : null}
          {confs[1] ? <Half conf={confs[1]} align="start" /> : null}
        </div>

        {finals.length ? (
          <section className="lg:col-start-4 mt-6 lg:mt-0">
            <h3
              className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2"
              style={MONO}
            >
              {finals[0].round_label}
            </h3>
            <div className="space-y-1.5">
              {finals.map((s, i) => <Series key={`${s.winner}-${i}`} s={s} i={i} />)}
            </div>
          </section>
        ) : null}
      </div>

      {champion ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">{champion}</strong> won the {season} title.
        </p>
      ) : null}

      {/* The play-in sits BELOW the bracket, not inside it. Those games decide
          who enters, so putting them in the first-round column would imply a
          team beaten there had a playoff run. It did not; it never got in. */}
      {playIn.length ? (
        <section className="mt-5">
          <h3
            className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5"
            style={MONO}
          >
            Play-in · decided who entered the bracket
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {playIn.map((s, i) => (
              <li
                key={`${s.winner}-${s.loser}-${i}`}
                className="rounded-md border px-2 py-1 text-[11px]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <span className="font-semibold">{s.winner}</span>
                {s.winner_seed ? (
                  <span className="text-[var(--text-dim)] tabular-nums" style={MONO}>
                    {" "}({s.winner_seed})
                  </span>
                ) : null}
                <span className="text-[var(--text-dim)]"> beat </span>
                <span>{s.loser}</span>
                {s.loser_seed ? (
                  <span className="text-[var(--text-dim)] tabular-nums" style={MONO}>
                    {" "}({s.loser_seed})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
