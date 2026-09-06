import Link from "next/link";
import ExpectationSparkline from "./ExpectationSparkline";
import type { PlClubEntry, PlClubSeason } from "@/lib/plExpectation";
import type { IntlClubEntry, IntlSeasonRow } from "@/lib/intlExpectation";

// One club's whole top-flight life measured against what the ratings expected
// of it, on the club page rather than on a board of its own.
//
// 🔴 ONE PANEL, SIX LEAGUES. England has its own ledger (with a market layer);
// Spain, Italy, Germany, France and the Netherlands share a second one built
// by importing the English model rather than copying it. A club appears in at
// most one, so the panel normalises whichever arrived and renders once. A
// second panel per league is how a club page ends up with two answers.
//
// TWO DIFFERENT UNITS, deliberately:
//   - the callouts use SEASON POINTS, because that is what a supporter
//     remembers ("81 on 53.6 expected"), under that season's own scoring;
//   - the sparkline uses MATCH POINTS (win 1, draw 0.5), because a win was
//     worth two league points before the three-point switch and three after,
//     and that switch fell in a different season in every country.

const POS = "#10b981";
const NEG = "#E2628B";
const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

type PanelSeason = PlClubSeason | IntlSeasonRow;

function fmt(v: number) {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
}

function Delta({ v, suffix = "" }: { v: number; suffix?: string }) {
  return (
    <span className="tabular-nums font-semibold" style={{ ...MONO, color: v >= 0 ? POS : NEG }}>
      {v >= 0 ? "+" : "−"}
      {Math.abs(v).toFixed(1)}
      {suffix}
    </span>
  );
}

function Callout({ kind, s }: { kind: "Best" | "Worst"; s: PanelSeason }) {
  const deduction = "deduction" in s ? s.deduction : undefined;
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">
        {kind} season against expectation
      </div>
      <div className="mt-0.5 text-sm">
        <span className="font-semibold tabular-nums" style={MONO}>{s.season}</span>{" "}
        <Delta v={s.diff} suffix=" league pts" />
      </div>
      <div className="text-[12.5px] text-[var(--text-muted)]">
        {s.pts} point{s.pts === 1 ? "" : "s"} on {s.xpts.toFixed(1)} expected
        {s.club ? <> as <span className="italic">{s.club}</span></> : null}
        {deduction ? <>, after a {deduction}-point deduction</> : null}
      </div>
    </div>
  );
}

/** What the panel actually needs, from whichever ledger supplied it. */
type PanelModel = {
  /** "English", "Spanish"; used as "Every {adjective} top-flight match". */
  competitionPhrase: string;
  /** "Primera División", shown once so the league is named, not just the country. */
  competitionName: string | null;
  displayName: string;
  seasons: PanelSeason[];
  totalSurplus: number;
  best: PanelSeason;
  worst: PanelSeason;
  metro: string | null;
  metroSlug: string | null;
  /** England: null, because the panel's own sentence already names 1981-82. */
  winPtsThreeFrom: string | null;
  eraNames: string[] | null;
  caveats: { season: string; kind: string; reason: string }[];
};

function fromPl(e: PlClubEntry): PanelModel {
  return {
    competitionPhrase: "English",
    competitionName: null,
    displayName: e.names[e.names.length - 1],
    seasons: e.seasons,
    totalSurplus: e.total_surplus,
    best: e.best,
    worst: e.worst,
    metro: e.metro,
    metroSlug: e.metro_slug,
    winPtsThreeFrom: null,
    eraNames: e.names.length > 1 ? e.names : null,
    caveats: [],
  };
}

const ADJ: Record<string, string> = {
  Spain: "Spanish",
  Italy: "Italian",
  Germany: "German",
  France: "French",
  Netherlands: "Dutch",
};

function fromIntl(e: IntlClubEntry): PanelModel {
  return {
    competitionPhrase: ADJ[e.country] ?? e.country,
    competitionName: e.competition,
    displayName: e.club,
    seasons: e.seasons,
    totalSurplus: e.total_surplus,
    best: e.best,
    worst: e.worst,
    metro: e.metro,
    metroSlug: e.metro_slug,
    winPtsThreeFrom: e.win_pts_three_from,
    // Merged from every ledger row sharing this slug inside one league, so a
    // club that changed its name carries the history rather than losing it.
    eraNames: e.names.length > 1 ? e.names : null,
    caveats: e.caveats,
  };
}

export default function ClubExpectationPanel({
  entry,
  intl,
}: {
  entry?: PlClubEntry | null;
  intl?: IntlClubEntry | null;
}) {
  // England first when both somehow arrive: it is the ledger with a market
  // layer, so it is the one the rest of the site can check.
  const m = entry ? fromPl(entry) : intl ? fromIntl(intl) : null;
  if (!m || m.seasons.length < 3) return null;

  const first = m.seasons[0].season;
  const last = m.seasons[m.seasons.length - 1].season;
  const beat = m.totalSurplus >= 0;
  // The rating has almost no skill before about 1960, which is worth saying on
  // a series that reaches back that far and misleading on one that does not.
  const reachesEarly = Number(first.slice(0, 4)) < 1960;

  return (
    <section
      className="rounded-xl border p-5 mb-6 min-w-0"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Against expectation</h2>
      <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
        Every {m.competitionPhrase} top-flight match this club has played
        {m.competitionName ? <> in the {m.competitionName}</> : null}, scored against the odds an
        Elo rating gave it before kick-off.{" "}
        <span className="text-[var(--text)]">
          Over {m.seasons.length} season{m.seasons.length === 1 ? "" : "s"} from {first} to {last} it
          has {beat ? "beaten" : "fallen short of"} them by <Delta v={m.totalSurplus} /> match points.
        </span>
      </p>

      <div className="mt-3">
        <ExpectationSparkline
          points={m.seasons.map((s) => ({
            season: s.season,
            value: s.surplus,
            // Both units, because the callouts below quote the other one.
            tooltip:
              `${s.season}: ${fmt(s.diff)} league points vs expected ` +
              `(${s.pts} on ${s.xpts.toFixed(1)}, ${s.win_pts} for a win)` +
              ` · bar height ${fmt(s.surplus)} match points`,
          }))}
          label={`${m.displayName}: surplus against expectation, ${first} to ${last}`}
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--text-dim)]" style={MONO}>
          <span>{first}</span>
          <span className="text-[var(--text-muted)]">
            one bar per season &middot; height in match points &middot; hover for that season
          </span>
          <span>{last}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Callout kind="Best" s={m.best} />
        <Callout kind="Worst" s={m.worst} />
      </div>

      <p className="mt-4 text-[12.5px] text-[var(--text-dim)]">
        Season points use that season&rsquo;s own scoring,{" "}
        {m.winPtsThreeFrom
          ? <>two for a win before {m.winPtsThreeFrom} and three from it</>
          : <>two for a win before 1981-82 and three after</>}
        ; the bars use match points so the whole series is comparable.
        {m.eraNames ? <> Played as {m.eraNames.join(", then ")}.</> : null}
        {reachesEarly ? (
          <> The rating only starts telling you much after about 1960. Before that, knowing the
            era&rsquo;s home-and-away split is almost as good as knowing the teams.</>
        ) : null}
      </p>

      {/* 🔴 A season whose table is not final is labelled wherever its numbers
          appear. The rating is sound; the table is not. */}
      {m.caveats.length > 0 ? (
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">
          {m.caveats.map((c) => (
            <span key={c.season} className="block">
              <span className="tabular-nums text-[var(--text-muted)]" style={MONO}>{c.season}</span>{" "}
              {c.kind === "supplemented" ? "results" : "table"} not final: {c.reason}.
            </span>
          ))}
        </p>
      ) : null}

      <p className="mt-2 text-[12.5px] flex flex-wrap gap-x-4 gap-y-1">
        {m.metroSlug ? (
          <Link href={`/rankings/${m.metroSlug}`} className="text-[var(--accent)] hover:underline">
            {`${m.metro} against expectation`}&nbsp;&rarr;
          </Link>
        ) : null}
        {/* 🔴 Every number on this panel needs a page that says where it came
            from. Before this link existed the club pages quoted a model whose
            method appeared nowhere on the site. */}
        <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline">
          How this is measured&nbsp;&rarr;
        </Link>
      </p>
    </section>
  );
}
