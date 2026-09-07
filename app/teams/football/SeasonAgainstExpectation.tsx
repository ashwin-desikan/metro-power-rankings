import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { SectionHead } from "@/app/_shared/SectionHead";
import { DivergingBar } from "@/app/_shared/DataBar";
import { CROSS_LEAGUE_NOTE, type SeasonLedgerTop } from "@/lib/footballSeasonExpectation";

// The season's two against-expectation superlatives, above the domestic
// tables that carry the same column club by club (SeasonHub -> Hub2027Client).
//
// 🔴 THIS BOARD IS CROSS-LEAGUE, so CROSS_LEAGUE_NOTE rides in `more` with the
// derivation. Same rule as lib/intlExpectation.ts and /sports/expectation.
// 🔴 THE CREDIT RIDES WITH THE NUMBERS: engsoccerdata is named here because
// the surpluses are here.

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function TopRow({
  label,
  row,
  tone,
}: {
  label: string;
  row: SeasonLedgerTop;
  tone: "pos" | "neg";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 min-w-0" style={cardStyle}>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          <CrestIcon name={row.club} size={16} className="flex-shrink-0" />
          <Link
            href={`/teams/football/${row.slug}`}
            className="text-sm font-semibold truncate hover:text-[var(--accent)]"
          >
            {row.club}
          </Link>
        </div>
        <div className="text-[11px] text-[var(--text-muted)] truncate">
          {row.competition} · {row.country}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <DivergingBar
          v={row.surplus}
          dp={2}
          suffix=""
          label="match points against expectation"
          style={{ color: tone === "pos" ? "var(--div-pos)" : "var(--div-neg)" }}
        />
        <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">pts vs exp</div>
      </div>
    </div>
  );
}

export default function SeasonAgainstExpectation({
  season,
  best,
  worst,
  leagueNames,
  sourceCredit,
}: {
  season: string;
  best: SeasonLedgerTop | null;
  worst: SeasonLedgerTop | null;
  /** The leagues this season's ledger actually covers, for the `more` note. */
  leagueNames: string[];
  sourceCredit: string;
}) {
  if (!best && !worst) return null;
  return (
    <div className="mb-5">
      <SectionHead
        title="Against expectation"
        sub="Match points earned minus expected, over the season."
        more={
          <>
            <p>
              Every match in these leagues is scored against a pre-game probability, and a club&apos;s
              surplus is the match points it took (a win 1, a draw 0.5) minus the points that model
              expected of it. Zero is a club that finished exactly where its results said it should.
            </p>
            <p className="mt-2">{CROSS_LEAGUE_NOTE}</p>
            <p className="mt-2">
              {season} covers {leagueNames.length === 1 ? "one league" : `${leagueNames.length} leagues`}
              : {leagueNames.join(", ")}. A club whose season the ledger does not carry has no figure
              here, and none is guessed.
            </p>
            {sourceCredit ? <p className="mt-2 text-xs text-[var(--text-dim)]">{sourceCredit}</p> : null}
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {best && <TopRow label="Beat expectation by most" row={best} tone="pos" />}
        {worst && <TopRow label="Fell short by most" row={worst} tone="neg" />}
      </div>
      {sourceCredit ? (
        <p className="mt-2 text-[11px] text-[var(--text-dim)]">{sourceCredit}</p>
      ) : null}
    </div>
  );
}
