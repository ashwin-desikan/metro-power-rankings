import Link from "next/link";
import ExpectationSparkline from "./ExpectationSparkline";
import type { PlClubEntry, PlClubSeason } from "@/lib/plExpectation";

// One club's whole top-flight life measured against what the ratings expected
// of it, on the club page rather than on a board of its own.
//
// TWO DIFFERENT UNITS, deliberately:
//   - the callouts use SEASON POINTS, because that is what a supporter
//     remembers ("81 on 53.6 expected"), under that season's own scoring;
//   - the sparkline uses MATCH POINTS (win 1, draw 0.5), because a win was
//     worth two until 1980-81 and three after, so league points are NOT
//     comparable down the length of the series.

const POS = "#10b981";
const NEG = "#E2628B";
const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function fmt(v: number) {
  return `${v >= 0 ? "+" : "\u2212"}${Math.abs(v).toFixed(1)}`;
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

function Callout({ kind, s }: { kind: "Best" | "Worst"; s: PlClubSeason }) {
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
        {s.deduction ? <>, after a {s.deduction}-point deduction</> : null}
      </div>
    </div>
  );
}

export default function ClubExpectationPanel({ entry }: { entry: PlClubEntry | null }) {
  if (!entry || entry.seasons.length < 3) return null;
  const first = entry.seasons[0].season;
  const last = entry.seasons[entry.seasons.length - 1].season;
  const beat = entry.total_surplus >= 0;
  const eraNames = entry.names.length > 1 ? entry.names : null;

  return (
    <section
      className="rounded-xl border p-5 mb-6 min-w-0"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Against expectation</h2>
      <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
        Every English top-flight match this club has played, scored against the odds an
        Elo rating gave it before kick-off.{" "}
        <span className="text-[var(--text)]">
          Over {entry.seasons.length} season{entry.seasons.length === 1 ? "" : "s"} from {first} to {last} it
          has {beat ? "beaten" : "fallen short of"} them by <Delta v={entry.total_surplus} /> match points.
        </span>
      </p>

      <div className="mt-3">
        <ExpectationSparkline
          points={entry.seasons.map((s) => ({
            season: s.season,
            value: s.surplus,
            // Both units, because the callouts below quote the other one.
            tooltip:
              `${s.season}: ${fmt(s.diff)} league points vs expected ` +
              `(${s.pts} on ${s.xpts.toFixed(1)}, ${s.win_pts} for a win)` +
              ` \u00b7 bar height ${fmt(s.surplus)} match points`,
          }))}
          label={`${entry.names[entry.names.length - 1]}: surplus against expectation, ${first} to ${last}`}
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
        <Callout kind="Best" s={entry.best} />
        <Callout kind="Worst" s={entry.worst} />
      </div>

      <p className="mt-4 text-[12.5px] text-[var(--text-dim)]">
        Season points use that season&rsquo;s own scoring, two for a win before 1981-82 and three after;
        the bars use match points so the whole series is comparable.
        {eraNames ? <> Played as {eraNames.join(", then ")}.</> : null}{" "}
        The rating only starts telling you much after about 1960 &mdash; before that, knowing the era&rsquo;s
        home-and-away split is almost as good as knowing the teams.
      </p>

      <p className="mt-2 text-[12.5px] flex flex-wrap gap-x-4 gap-y-1">
        {entry.metro_slug ? (
          <Link href={`/rankings/${entry.metro_slug}`} className="text-[var(--accent)] hover:underline">
            {`${entry.metro} against expectation`}&nbsp;&rarr;
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
