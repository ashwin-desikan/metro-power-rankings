import Link from "next/link";
import { CollapsibleSection } from "@/app/_shared/CollapsibleSection";
import { getClubValueBySlug, getClubValueIndex, type ValueMonth } from "@/lib/clubValue";
import ValueStepChart from "./ValueStepChart";

// The club page's squad-value panel: one club's Transfermarkt-priced squad,
// 2012-07 to 2026-06, next to (not inside) the Against Expectation panel
// above it, since one measures the pitch and the other the wallet.
//
// 🔴 RENDERS NOTHING when the club has no priced squad. The great majority of
// club pages fall outside the six leagues this ledger covers, and a panel
// that renders an em-dash board for 1,400 clubs is worse than no panel.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function fmtEur(v: number): string {
  return v >= 1000 ? `€${(v / 1000).toFixed(2)}b` : `€${v.toFixed(0)}m`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1]} ${y}`;
}

export default async function ClubValuePanel({ slug }: { slug: string }) {
  const [club, idx] = await Promise.all([
    getClubValueBySlug(slug).catch(() => null),
    getClubValueIndex().catch(() => null),
  ]);
  if (!club) return null;

  const valued = club.series.filter(
    (r): r is ValueMonth & { v: number } => r.v != null,
  );
  if (valued.length < 2) return null;

  const peak = valued.reduce((a, b) => (b.v > a.v ? b : a));
  const latest = valued[valued.length - 1];
  const sourceCredit =
    idx?._meta.source_credit ??
    "Player valuations from Transfermarkt via github.com/dcaribou/transfermarkt-datasets";

  return (
    <CollapsibleSection
      id="squad-value"
      title="What the squad was worth"
      sub="Total market value of the squad, EUR millions, by month; the player count beside it is the size of the priced squad."
      meta={<span className="tabular-nums" style={MONO}>{fmtEur(latest.v)}</span>}
      more={
        <>
          <p>
            Drawn as a step, not a curve: Transfermarkt reprices every squad in{" "}
            <span className="text-[var(--text)]">December and June</span> (marked with a small tick on
            the axis) and revalues continuously between, so the line only moves when a real valuation
            changed, never by interpolation.
          </p>
          <p className="mt-2">
            A month renders no value at all once the priced squad falls below{" "}
            <span className="text-[var(--text)]">15 players</span>, so a thin squad is never shown as a
            cheap one. The series is floored at{" "}
            <span className="text-[var(--text)]">July 2012</span> on purpose: earlier Transfermarkt
            totals reflect which players happened to be priced yet rather than the squad&rsquo;s real
            worth, and are excluded rather than shown misleadingly low.
          </p>
          <p className="mt-2">
            Upstream (dcaribou/transfermarkt-datasets) has been paused since July 2026, so the series
            ends where the source ends rather than where the season does.
          </p>
          <p className="mt-2 text-[var(--text-dim)]">{sourceCredit}.</p>
        </>
      }
    >
      <div>
        <ValueStepChart
          series={valued}
          label={`${club.club}: squad value by month, ${club.first} to ${club.last}`}
        />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Peak</div>
            <div className="mt-0.5">
              <span className="font-semibold tabular-nums" style={MONO}>{fmtEur(peak.v)}</span>{" "}
              <span className="text-[var(--text-muted)]">
                in {monthLabel(peak.m)} · {peak.n} players valued
              </span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Most recent</div>
            <div className="mt-0.5">
              <span className="font-semibold tabular-nums" style={MONO}>{fmtEur(latest.v)}</span>{" "}
              <span className="text-[var(--text-muted)]">
                in {monthLabel(latest.m)} · {latest.n} players valued
              </span>
            </div>
          </div>
        </div>
        {club.metro_slug ? (
          <p className="mt-3 text-[12.5px]">
            <Link href={`/rankings/${club.metro_slug}`} className="text-[var(--accent)] hover:underline">
              {club.metro} on the rankings&nbsp;&rarr;
            </Link>
          </p>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}
