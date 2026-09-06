import Link from "next/link";
import type { MetroRow as NflMetroRow } from "@/lib/nflExpectation";
import type { PlMetroRow } from "@/lib/plExpectation";
import type { IntlMetroRow } from "@/lib/intlExpectation";
import { joinCountries } from "@/lib/intlExpectation";

// The metro's sporting record against what was expected of it, in one card.
//
// 🔴 ONE SHARED COMPONENT, NOT A PER-SPORT COPY. Three ledgers now, and more
// will follow; a second inline block on /rankings/[slug] is how the site ends
// up with two answers a scroll apart.
//
// 🔴 THE UNITS ARE NOT THE SAME QUANTITY and the card never adds them.
// The NFL ledger measures WINS above expectation; the football ones measure
// MATCH POINTS (win 1, draw 0.5), because football has draws and a league win
// was worth two points before the three-point switch and three after, and that
// switch fell in a different season in every country. Each line names its own
// unit and its own competition.

const POS = "#10b981";
const NEG = "#E2628B";
const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function Amount({ v }: { v: number }) {
  return (
    <span className="tabular-nums font-semibold" style={{ ...MONO, color: v >= 0 ? POS : NEG }}>
      {Math.abs(v).toFixed(1)}
    </span>
  );
}

/** "1928-29" -> "1928". The card talks in years, the data in seasons. */
function startYear(season: string): string {
  return season.slice(0, 4);
}

export default function MetroExpectationCard({
  metroName,
  nfl,
  football,
  continental,
}: {
  metroName: string;
  nfl?: NflMetroRow | null;
  football?: PlMetroRow | null;
  /** Spain, Italy, Germany, France, the Netherlands. Never England: that is
   *  the `football` line, on a separate ledger with a market layer. */
  continental?: IntlMetroRow | null;
}) {
  if (!nfl && !football && !continental) return null;
  return (
    <section>
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm min-w-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="font-semibold">Against expectation</span>{" "}
        <span className="text-[var(--text-muted)]">
          how {metroName}&rsquo;s teams have done against the odds they went in with.
        </span>
        <ul className="mt-2 space-y-1.5">
          {football && (
            <li className="text-[var(--text-muted)]">
              <span aria-hidden className="mr-1.5">⚽</span>
              English top-flight clubs based here have{" "}
              {football.surplus >= 0 ? "beaten" : "fallen short of"} their pre-match odds by{" "}
              <Amount v={football.surplus} /> match points across {football.club_matches.toLocaleString()}{" "}
              club-matches since 1888.
            </li>
          )}
          {continental && (
            <li className="text-[var(--text-muted)]">
              <span aria-hidden className="mr-1.5">⚽</span>
              {joinCountries(continental.countries)} top-flight clubs based here have{" "}
              {continental.surplus >= 0 ? "beaten" : "fallen short of"} their pre-match odds by{" "}
              <Amount v={continental.surplus} /> match points across{" "}
              {continental.club_matches.toLocaleString()} club-matches since{" "}
              {startYear(continental.first_season)}
              {continental.clubs > 1 ? <>, across {continental.clubs} clubs</> : null}.
            </li>
          )}
          {nfl && (
            <li className="text-[var(--text-muted)]">
              <span aria-hidden className="mr-1.5">🏈</span>
              NFL teams representing {metroName} have{" "}
              {nfl.wae >= 0 ? "beaten" : "fallen short of"} their pre-game odds by <Amount v={nfl.wae} />{" "}
              wins across {nfl.seasons} team-seasons since 1920.
            </li>
          )}
        </ul>
        {/* 🔴 Outside the per-sport list. A metro with football and no NFL was
            getting no method link at all, which left the numbers orphaned. */}
        <p className="mt-2 text-[12.5px]">
          <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline whitespace-nowrap">
            How this is measured&nbsp;&rarr;
          </Link>
        </p>
      </div>
    </section>
  );
}
