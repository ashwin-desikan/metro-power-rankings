import Link from "next/link";
import { CollapsibleSection } from "@/app/_shared/CollapsibleSection";
import SortableBoard from "@/app/_shared/SortableBoard";
import { getClubMoneyBySlug } from "@/lib/footballMoney";
import { fmtEurM, fmtEurSigned, isStubSeason, type MoneySeason } from "@/lib/footballMoneyShape";

// The club page's Money Ledger: fees paid and received per season, beside
// the squad-value panel above it, with the season's appreciation as the
// argument (what the squad gained once the trading is netted out).
//
// 🔴 RENDERS NOTHING when the club has no ledger: outside the six leagues,
// or a club the crosswalk could not place. Same rule as ClubValuePanel.
//
// 🔴 EVERY TOTAL RENDERS ITS NO-FEE COUNT. A move with no fee on record is
// counted and never priced, so a season of loans and frees reads as quiet
// rather than free.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const BORD = { borderColor: "var(--border)" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Signed({ v, dim }: { v: number | null; dim?: boolean }) {
  if (v == null) return <span className="text-[var(--text-dim)]">—</span>;
  const tone = v > 0 ? "var(--div-pos)" : v < 0 ? "var(--div-neg)" : "var(--text-muted)";
  return (
    <span className="tabular-nums" style={{ ...MONO, color: dim ? "var(--text-muted)" : tone }}>
      {fmtEurSigned(v)}
    </span>
  );
}

function Amount({ v, n, nofee }: { v: number; n: number; nofee: number }) {
  return (
    <>
      <span className="tabular-nums" style={MONO}>{v > 0 ? fmtEurM(v) : <span className="text-[var(--text-dim)]">—</span>}</span>
      <span
        className="ml-1.5 text-[10px] text-[var(--text-dim)] whitespace-nowrap"
        style={MONO}
        title={`${n} with a fee${nofee > 0 ? `, ${nofee} with no fee on record` : ""}`}
      >
        {n}{nofee > 0 ? `+${nofee}` : ""}
      </span>
    </>
  );
}

function Move({ m }: { m: MoneySeason["biggest_in"] }) {
  if (!m) return <span className="text-[var(--text-dim)]">—</span>;
  // Player and fee on the row; the other club is a tooltip, because two of
  // these columns at "Fußballclub Red Bull Salzburg" width pushed the table
  // to 1436px in a 1120px card (measured 2026-09-10) and the fee is the fact.
  return (
    <span className="whitespace-nowrap" title={m.club}>
      {m.player} <span className="text-[var(--text-dim)]">{fmtEurM(m.fee)}</span>
    </span>
  );
}

export default async function ClubMoneyPanel({ slug }: { slug: string }) {
  const hit = await getClubMoneyBySlug(slug).catch(() => null);
  if (!hit) return null;
  const { record: club, meta } = hit;
  const seasons = [...club.seasons].reverse();   // latest first, the value chart above ends there too
  if (!seasons.length) return null;

  const nIn = club.seasons.reduce((a, s) => a + s.n_in, 0);
  const nOut = club.seasons.reduce((a, s) => a + s.n_out, 0);
  const nofee = club.seasons.reduce((a, s) => a + s.nofee_in + s.nofee_out, 0);
  const dataEndLabel = meta.data_end.slice(0, 4) === "2026" ? "6 July 2026" : meta.data_end;
  const stubLabel = (s: MoneySeason) => (isStubSeason(s.season, meta.data_end) ? `to ${dataEndLabel}` : null);

  return (
    <CollapsibleSection
      id="money"
      title="The money ledger"
      sub="Fees paid and received each season, and what the squad was worth once the trading is netted out."
      meta={<Signed v={club.net} />}
      more={
        <>
          <p>
            Spent is the fees paid for players arriving, received the fees for players leaving, both in
            EUR millions by the July-to-June season of the move. A move with no fee on record (a free, a
            loan, an undisclosed sum) is <span className="text-[var(--text)]">counted, never priced</span>:
            the small figure beside each total is the moves with a fee, plus those without (so{" "}
            <span className="tabular-nums" style={MONO}>4+3</span> is four priced arrivals and three
            unpriced), and a quiet window is not mistaken for a cheap one.
            Wages are not here: they are estimates nobody licenses, and fees are documented.
          </p>
          <p className="mt-2">
            <span className="text-[var(--text)]">Appreciation</span> is the season&rsquo;s change in squad
            value with the net spend taken out: buy 100m of players and finish 100m higher is zero; finish
            120m higher and the club made 20m of players better, or the market repriced them. It needs a
            priced squad at both ends of the season (the same 15-player floor as the value chart), so it is
            blank rather than guessed for a season that lacks one.
          </p>
          <p className="mt-2">
            The source has been paused since {dataEndLabel}, so the final row holds only the opening days of
            its window.
          </p>
          <p className="mt-2 text-[var(--text-dim)]">{meta.source_credit}.</p>
        </>
      }
    >
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Spent</div>
            <div className="mt-0.5 font-semibold tabular-nums" style={MONO}>{fmtEurM(club.spent)}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{nIn} arrivals with a fee</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Received</div>
            <div className="mt-0.5 font-semibold tabular-nums" style={MONO}>{fmtEurM(club.received)}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{nOut} departures with a fee</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Net</div>
            <div className="mt-0.5 font-semibold"><Signed v={club.net} /></div>
            <div className="text-[11px] text-[var(--text-muted)]">{nofee} moves with no fee</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Appreciation</div>
            <div className="mt-0.5 font-semibold"><Signed v={club.appreciation} /></div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {club.seasons_valued} season{club.seasons_valued === 1 ? "" : "s"} with a priced squad
            </div>
          </div>
        </div>
        <SortableBoard
          id="club-money"
          rank={false}
          mobileNoun="seasons"
          mobileInitial={8}
          className="rounded-xl border"
          style={CARD}
          initial={{ key: "y", dir: "desc" }}
          cols={[
            { key: "y", label: "Season", className: "whitespace-nowrap" },
            { key: "spent", label: "Spent", right: true, title: "Fees paid; the small figure is arrivals with a fee, plus those without" },
            { key: "received", label: "Received", right: true, title: "Fees received; the small figure is departures with a fee, plus those without" },
            { key: "net", label: "Net", right: true },
            { key: "v_end", label: "Value, Jul to Jun", right: true, demote: true, title: "Squad value at the start and end of the season; sorts on the June value" },
            { key: "appreciation", label: "Appreciation", right: true, title: "Squad value gained beyond the net spend" },
            { key: "in", label: "Biggest arrival", sortable: false, demote: true },
            { key: "out", label: "Biggest sale", sortable: false, demote: true },
          ]}
          rows={seasons.map((s) => ({
            key: s.season,
            sort: { y: s.y, spent: s.spent, received: s.received, net: s.net, v_end: s.v_end, appreciation: s.appreciation },
            cells: [
              <span key="s" className="tabular-nums whitespace-nowrap" style={MONO}>
                {s.season}
                {stubLabel(s) ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{stubLabel(s)}</span> : null}
              </span>,
              <span key="p" className="whitespace-nowrap"><Amount v={s.spent} n={s.n_in} nofee={s.nofee_in} /></span>,
              <span key="r" className="whitespace-nowrap"><Amount v={s.received} n={s.n_out} nofee={s.nofee_out} /></span>,
              <Signed key="n" v={s.net} dim />,
              <span key="v" className="tabular-nums whitespace-nowrap text-[var(--text-muted)]" style={MONO}>
                {s.v_start != null && s.v_end != null ? (
                  <>{fmtEurM(s.v_start)} <span className="text-[var(--text-dim)]">→</span> {fmtEurM(s.v_end)}
                    <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">{s.n_end}p</span></>
                ) : <span className="text-[var(--text-dim)]">—</span>}
              </span>,
              <Signed key="a" v={s.appreciation} />,
              <Move key="i" m={s.biggest_in} />,
              <Move key="o" m={s.biggest_out} />,
            ],
            mobile: {
              name: (
                <span className="whitespace-normal leading-snug">
                  <span className="tabular-nums" style={MONO}>{s.season}</span>{" "}
                  <span className="text-[var(--text-muted)]">spent</span> {s.spent > 0 ? fmtEurM(s.spent) : "—"}{" "}
                  <span className="text-[var(--text-muted)]">received</span> {s.received > 0 ? fmtEurM(s.received) : "—"}
                  {stubLabel(s) ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{stubLabel(s)}</span> : null}
                </span>
              ),
              sub: s.biggest_in ? <>in: {s.biggest_in.player} {fmtEurM(s.biggest_in.fee)}</> : s.biggest_out ? <>out: {s.biggest_out.player} {fmtEurM(s.biggest_out.fee)}</> : <>{s.nofee_in + s.nofee_out} moves, no fee on record</>,
              right: <Signed v={s.appreciation} />,
              rightSub: s.appreciation == null ? "unpriced" : "squad gain",
            },
          }))}
        />
        <p className="mt-3 text-[12.5px]">
          <Link href="/sports/expectation#money" className="text-[var(--accent)] hover:underline">
            Every club&rsquo;s return on the transfer window&nbsp;&rarr;
          </Link>
        </p>
      </div>
    </CollapsibleSection>
  );
}
