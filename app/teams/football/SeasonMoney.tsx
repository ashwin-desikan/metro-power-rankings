"use client";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import SortableBoard from "@/app/_shared/SortableBoard";
import { fmtEurM, fmtEurSigned, type MoneyBoardRow } from "@/lib/footballMoneyShape";

// The season hub's money view, 2012-13 to 2025-26 only: the third tab of the
// club power ranking (RankingTable), beside the ranking and the country
// coefficients, because Ashwin ruled it is "another pin in that ecosystem
// rather than its own separate table further down the sheet". Every club
// in the six leagues with a window that season, ranked on what the squad
// gained in value once the trading is netted out; sortable on every column
// (SortableBoard), on the phone too.
//
// 🔴 CROSS-LEAGUE BY DESIGN, and honest about it: the spend rank WITHIN the
// club's own league rides beside the league name, so the fourth club on the
// board can be seen to have been first in Spain.
//
// 🔴 THE CREST KEYS ON THE SITE'S NAME, never Transfermarkt's. "Como 1907"
// finds no crest; `site_name` ("Como") does. The displayed name stays the
// source's, as ruled, and the link is the canonical club page.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Signed({ v, strong }: { v: number | null; strong?: boolean }) {
  if (v == null) return <span className="text-[var(--text-dim)]">—</span>;
  const tone = v > 0 ? "var(--div-pos)" : v < 0 ? "var(--div-neg)" : "var(--text-muted)";
  return (
    <span className={`tabular-nums${strong ? " font-semibold" : ""}`} style={{ ...MONO, color: strong ? tone : "var(--text-muted)" }}>
      {fmtEurSigned(v)}
    </span>
  );
}

function Club({ r, truncate }: { r: MoneyBoardRow; truncate?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <CrestIcon name={r.site_name ?? r.club} size={14} className="flex-shrink-0" />
      <Link href={`/teams/football/${r.slug}`} className={`hover:text-[var(--accent)]${truncate ? " truncate" : ""}`}>{r.club}</Link>
    </span>
  );
}

export default function MoneyBoard({
  season,
  rows,
  sourceCredit,
}: {
  season: string;
  rows: MoneyBoardRow[];
  sourceCredit: string;
}) {
  const priced = rows.filter((r) => r.appreciation != null);
  if (!priced.length) return null;
  const best = priced[0];
  const worst = priced[priced.length - 1];
  const spender = [...rows].sort((a, b) => b.spent - a.spent)[0];
  const leagues = new Set(rows.map((r) => r.country)).size;
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--text-muted)] max-w-3xl">
        Fees paid and received in {season} across {leagues} leagues, and what each squad gained in value once the
        trading is netted out (June value minus the previous July, minus net spend; blank where the squad was not
        priced at both ends). Spend rank beside the league is within that league.{" "}
        {best.club} gained the most beyond its spending, <Signed v={best.appreciation} strong />;{" "}
        {spender.club} spent the most, <span className="tabular-nums" style={MONO}>{fmtEurM(spender.spent)}</span>
        {spender.appreciation != null ? <>, for <Signed v={spender.appreciation} strong /></> : null}
        {worst.slug !== best.slug ? <>; {worst.club} sits at the foot, <Signed v={worst.appreciation} strong /></> : null}.
      </p>
      <SortableBoard
        id="money"
        compact
        mobileNoun="clubs"
        mobileInitial={10}
        className="rounded-xl border"
        style={CARD}
        initial={{ key: "appreciation", dir: "desc" }}
        cols={[
          { key: "club", label: "Club", className: "whitespace-nowrap" },
          { key: "country", label: "League", title: "League, with the club's spend rank within it" },
          { key: "spent", label: "Spent", right: true },
          { key: "received", label: "Received", right: true, demote: true },
          { key: "net", label: "Net", right: true },
          { key: "v_end", label: "Value, Jul to Jun", right: true, demote: true, title: "Squad value at the start and end of the season; sorts on the June value" },
          { key: "appreciation", label: "Appreciation", right: true, title: "Squad value gained beyond the net spend" },
          { key: "biggest", label: "Biggest arrival", sortable: false, demote: true },
        ]}
        rows={rows.map((r) => ({
          key: r.slug,
          sort: { club: r.club, country: r.country, spent: r.spent, received: r.received, net: r.net, v_end: r.v_end, appreciation: r.appreciation },
          cells: [
            <span key="c" className="font-medium"><Club r={r} /></span>,
            <span key="l" className="whitespace-nowrap text-[var(--text-muted)]">
              {r.country}
              <span className="ml-1.5 text-[10px] text-[var(--text-dim)]" style={MONO} title={`#${r.spend_rank} on spend in ${r.country}`}>#{r.spend_rank}</span>
            </span>,
            <span key="s" className="tabular-nums" style={MONO}>{r.spent > 0 ? fmtEurM(r.spent) : <span className="text-[var(--text-dim)]">—</span>}</span>,
            <span key="r" className="tabular-nums text-[var(--text-muted)]" style={MONO}>{r.received > 0 ? fmtEurM(r.received) : <span className="text-[var(--text-dim)]">—</span>}</span>,
            <Signed key="n" v={r.net} />,
            <span key="v" className="tabular-nums whitespace-nowrap text-[var(--text-muted)]" style={MONO}>
              {r.v_start != null && r.v_end != null ? (
                <>{fmtEurM(r.v_start)} <span className="text-[var(--text-dim)]">→</span> {fmtEurM(r.v_end)}<span className="ml-1.5 text-[10px] text-[var(--text-dim)]">{r.n_end}p</span></>
              ) : <span className="text-[var(--text-dim)]">—</span>}
            </span>,
            <Signed key="a" v={r.appreciation} strong />,
            <span key="b" className="whitespace-nowrap">
              {r.biggest_in ? <>{r.biggest_in.player} <span className="text-[var(--text-dim)]">{fmtEurM(r.biggest_in.fee)} · {r.biggest_in.club}</span></> : <span className="text-[var(--text-dim)]">—</span>}
            </span>,
          ],
          mobile: {
            name: (
              <>
                <Club r={r} truncate />
                <span className="flex-shrink-0 text-[var(--text-dim)] text-[11px]">{r.country}</span>
              </>
            ),
            sub: <>spent {r.spent > 0 ? fmtEurM(r.spent) : "—"} · received {r.received > 0 ? fmtEurM(r.received) : "—"} · #{r.spend_rank} spend in {r.country}</>,
            right: <Signed v={r.appreciation} strong />,
            rightSub: r.appreciation == null ? "unpriced" : "squad gain",
          },
        }))}
      />
      {sourceCredit ? <p className="mt-2 text-[11px] text-[var(--text-dim)]">{sourceCredit}</p> : null}
    </div>
  );
}
