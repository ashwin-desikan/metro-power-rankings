import Link from "next/link";
import { DataBar } from "@/app/_shared/DataBar";
import { CappedList } from "@/app/_shared/Disclosure";
import { TableScroll } from "@/app/_shared/TableScroll";
import type { ZzcNation } from "@/lib/zoneZeroCup";

// The Cup read down the other axis. The main table asks how much merit a nation
// holds; this asks how much merit a SPORT holds, and who holds it. Both come
// from the same sportMerit map, so the two can never disagree.
//
// Computed here at render rather than baked into zone-zero-cup.json on purpose:
// it is one pass over ~250 nations, the page already has the data in memory, and
// keeping it out of the weekly Python build means a change to the presentation
// never waits on a pipeline run.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { borderColor: "var(--border)", backgroundColor: "var(--bg-card)" } as const;

export type SportRow = {
  sport: string;
  total: number;
  share: number;
  nations: number;
  topFourShare: number;
  weight: number | null;
  leaders: { name: string; slug: string | null; pts: number; defunct: boolean; suspended: boolean }[];
};

export function buildSportRows(nations: ZzcNation[], prestige: Record<string, number>): SportRow[] {
  const acc = new Map<string, { total: number; holders: ZzcNation[] }>();
  for (const n of nations) {
    // No `?? {}`: sportMerit is a required Record on ZzcNation, and the union
    // with an empty object is what makes Object.entries infer `unknown` values.
    for (const [sport, pts] of Object.entries(n.sportMerit)) {
      const a = acc.get(sport) ?? { total: 0, holders: [] };
      a.total += pts;
      a.holders.push(n);
      acc.set(sport, a);
    }
  }
  const grand = [...acc.values()].reduce((s, a) => s + a.total, 0) || 1;

  return [...acc.entries()]
    .map(([sport, a]) => {
      const ranked = [...a.holders].sort(
        (x, y) => (y.sportMerit[sport] ?? 0) - (x.sportMerit[sport] ?? 0),
      );
      const top = ranked.slice(0, 4);
      const topSum = top.reduce((s, n) => s + (n.sportMerit[sport] ?? 0), 0);
      return {
        sport,
        total: a.total,
        share: (a.total / grand) * 100,
        nations: a.holders.length,
        // A sport with no points at all is not concentrated, it is empty. Zero
        // over zero would render as NaN%, so it reads as a dash instead.
        topFourShare: a.total > 0 ? (topSum / a.total) * 100 : 0,
        weight: prestige[sport] ?? null,
        leaders: top.map((n) => ({
          name: n.name,
          slug: n.countrySlug,
          pts: n.sportMerit[sport] ?? 0,
          defunct: !!n.defunct,
          suspended: !!n.suspended,
        })),
      };
    })
    .sort((a, b) => b.total - a.total);
}

function Leaders({ row }: { row: SportRow }) {
  return (
    <>
      {row.leaders.map((l, i) => (
        <span key={l.name}>
          {i > 0 ? ", " : ""}
          {l.slug ? (
            <Link href={`/countries/${l.slug}`} className="hover:text-[var(--accent)]">{l.name}</Link>
          ) : (
            <span>{l.name}</span>
          )}
          {l.defunct ? <span className="text-[var(--text-dim)]" title="No longer competes">&#8224;</span> : null}
          {l.suspended ? <span className="text-[var(--text-dim)]" title="Under international suspension">&#42;</span> : null}
        </span>
      ))}
    </>
  );
}

export default function SportTotals({ rows }: { rows: SportRow[] }) {
  const maxTotal = Math.max(...rows.map((r) => r.total));
  return (
    <>
      <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
        <table className="w-full text-sm" data-sticky-col={2}>
          <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Sport</th>
              <th className="px-3 py-2">Points</th>
              <th className="px-3 py-2 text-right">Share</th>
              <th className="px-3 py-2 text-right">Nations</th>
              <th className="px-3 py-2 text-right">Top four hold</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2">Leaders</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.sport} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.sport}</td>
                <td className="px-3 py-2.5">
                  <DataBar v={r.total} max={maxTotal} dp={1} width={110} label={`${r.sport} total points`} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{r.share.toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.nations}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.total > 0 ? `${r.topFourShare.toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>
                  {r.weight != null ? `${r.weight.toFixed(1)}×` : "—"}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]"><Leaders row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="sports"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={rows.map((r, i) => (
            <div key={r.sport} className="rounded-lg border p-3" style={CARD}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 font-medium text-[var(--text)]">
                  <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                  {r.sport}
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{r.total.toFixed(1)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                <span>{r.share.toFixed(1)}% of the Cup</span>
                <span>{r.nations} nations</span>
                {r.total > 0 ? <span>top four hold {r.topFourShare.toFixed(0)}%</span> : null}
                {r.weight != null ? <span>weight {r.weight.toFixed(1)}×</span> : null}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] leading-snug"><Leaders row={r} /></div>
            </div>
          ))}
        />
      </div>
    </>
  );
}
