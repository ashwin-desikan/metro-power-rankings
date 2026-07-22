import Link from "next/link";
import SortableTable from "./SortableTable";
import { DetailPager, type HubElection } from "./HubShared";
import { warsDuringElection, warLabel } from "@/lib/electionConflicts";

// Shared detail-page renderer for the legislative election hubs (Australia,
// Germany, India, and France's legislative contests). Server component; each
// hub's [id] page supplies data, labels and colors. Tables are sortable, and
// the layout degrades gracefully where 19th-century sources have no party
// table, seat total or turnout.

export type LegDetailConfig = {
  hubHref: string; // "/elections/au"
  hubName: string; // "Australia"
  headingSuffix: string; // "Federal Election"
  roleLabel: string; // "Prime Minister" | "Chancellor"
  chamberFallback: string; // "the House" — used in the share column header
  colorOf: (n: string | null | undefined) => string;
  fmtInt: (n: number | null | undefined) => string;
  fmtPct: (n: number | null | undefined, dp?: number) => string;
};

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-lg font-bold text-[var(--text)]">{value}</p>
      {sub ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p> : null}
    </div>
  );
}

export default async function LegElectionDetail({
  e,
  era,
  prev,
  next,
  cfg,
}: {
  e: HubElection;
  era: { key: string; label: string } | null;
  prev: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
  cfg: LegDetailConfig;
}) {
  const wars = await warsDuringElection(cfg.hubHref, e.year);
  const changed = !!(e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const knownSeats = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const total = e.totalSeats;
  const rest = total ? Math.max(0, total - knownSeats) : 0;
  const maxSeats = Math.max(...withSeats.map((p) => p.seats ?? 0), 1);
  const hasAlliance = e.parties.some((p) => p.alliance);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href={cfg.hubHref} className="hover:underline">{cfg.hubName}</Link>
        {" / "}
        <span>{e.label}</span>
      </nav>

      <DetailPager hubHref={cfg.hubHref} hubName={cfg.hubName} prev={prev} next={next} />

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} {cfg.headingSuffix}</h1>
          {e.knownAs ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-1 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.knownAs}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--text-dim)] mt-1">
          {e.date}
          {era ? (
            <>
              {" · "}
              <Link href={`${cfg.hubHref}#era-${era.key}`} className="hover:text-[var(--accent)]">
                {era.label}
              </Link>
            </>
          ) : null}
          {total ? (
            <>
              {" · "}
              {total} seats
              {e.majoritySeats ? `, ${e.majoritySeats} for a majority` : ""}
            </>
          ) : null}
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{e.summary}</p>
      </header>

      {wars.length ? (
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl rounded-xl border p-4" style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}>
          <span className="font-semibold" style={{ color: "#D97706" }}>Held in wartime.</span>{" "}
          This election took place while the country was engaged in{" "}
          {wars.map((w) => warLabel(w)).join("; ")}.{" "}
          <Link href="/conflicts" className="text-[var(--accent)] hover:underline">Conflicts →</Link>
        </p>
      ) : null}

      {e.unfree || e.caveat ? (
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          {e.caveat
            ? e.caveat
            : e.unfree === "partial"
              ? "This vote was held under state terror, with opposition parties suppressed, and was only partially free. It is recorded here as history, not as a normal election."
              : "This was a single-list vote under a dictatorship, with no opposition permitted. It is recorded here as history, not as a free election."}
        </p>
      ) : null}

      {/* result strip */}
      {total && withSeats.length > 0 ? (
        <div className="mb-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
            {withSeats.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                style={{ width: `${((p.seats ?? 0) / total) * 100}%`, backgroundColor: cfg.colorOf(p.name), marginRight: i < withSeats.length - 1 || rest > 0 ? 2 : 0 }}
                title={`${p.name}: ${p.seats} seats`}
              />
            ))}
            {rest > 0 ? <div style={{ width: `${(rest / total) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Others / not listed: ${rest} seats`} /> : null}
          </div>
          {e.majoritySeats ? (
            <div className="relative h-2">
              <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: `${(e.majoritySeats / total) * 100}%` }} title={`${e.majoritySeats} seats for a majority`} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact
          label={`${cfg.roleLabel} before`}
          value={e.pmBefore ? e.pmBefore.name : "—"}
          sub={e.pmBefore?.party ?? undefined}
        />
        <Fact
          label={changed ? `${cfg.roleLabel} after` : `${cfg.roleLabel} (continued)`}
          value={e.pmAfter ? e.pmAfter.name : "—"}
          sub={e.pmAfter?.party ?? undefined}
        />
        <Fact
          label="Largest force"
          value={e.seatLeader ?? "—"}
          sub={
            e.seatLeader
              ? (() => {
                  const w = e.parties.find((p) => p.name === e.seatLeader);
                  return w && w.seats != null ? `${w.seats}${total ? ` of ${total}` : ""} seats` : undefined;
                })()
              : undefined
          }
        />
        <Fact label="Turnout" value={cfg.fmtPct(e.turnout)} />
      </div>

      {/* parties table */}
      {e.parties.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The result</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-sm"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "party", label: "Party", className: "px-3 py-2" },
                ...(hasAlliance ? [{ key: "alliance", label: "Alliance", className: "px-3 py-2" }] : []),
                { key: "leader", label: "Leader", className: "px-3 py-2" },
                { key: "seats", label: "Seats", className: "px-3 py-2 text-right" },
                { key: "change", label: "±", className: "px-3 py-2 text-right" },
                { key: "bar", label: `Share of ${cfg.chamberFallback}`, className: "px-3 py-2 w-1/5", sortable: false },
                { key: "votes", label: "Votes", className: "px-3 py-2 text-right" },
                { key: "share", label: "Vote share", className: "px-3 py-2 text-right" },
                { key: "swing", label: "Swing", className: "px-3 py-2 text-right" },
              ]}
              rows={e.parties.map((p, i) => ({
                key: `${p.name}-${i}`,
                sort: {
                  party: p.name,
                  ...(hasAlliance ? { alliance: p.alliance ?? null } : {}),
                  leader: p.leader,
                  seats: p.seats,
                  change: p.seatChange ?? null,
                  votes: p.votes,
                  share: p.share,
                  swing: p.swing,
                },
                cells: (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: cfg.colorOf(p.name) }} />
                      <span className="font-semibold text-[var(--text)]">{p.name}</span>
                    </td>
                    {hasAlliance ? (
                      <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{p.alliance ?? "—"}</td>
                    ) : null}
                    <td className="px-3 py-2 text-[var(--text-muted)]">{p.leader ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{p.seats != null ? p.seats : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {p.seatChange == null ? "—" : `${p.seatChange > 0 ? "+" : ""}${Math.round(p.seatChange)}`}
                    </td>
                    <td className="px-3 py-2">
                      {p.seats != null ? (
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                          <div className="h-full rounded-full" style={{ width: `${(p.seats / maxSeats) * 100}%`, backgroundColor: cfg.colorOf(p.name) }} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{cfg.fmtInt(p.votes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{cfg.fmtPct(p.share)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {p.swing == null ? "—" : `${p.swing > 0 ? "+" : ""}${p.swing.toFixed(1)}`}
                    </td>
                  </>
                ),
              }))}
            />
          </div>
          {rest > 0 ? (
            <p className="text-xs text-[var(--text-dim)] mt-2">
              {rest} further {rest === 1 ? "seat" : "seats"} went to parties and independents outside the main
              contenders listed above.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-[var(--text-dim)] mb-8 max-w-3xl">
          The surviving record for this contest does not include a party-by-party results table; the story
          above is what the sources support.
        </p>
      )}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`${cfg.hubHref}/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label}
          </Link>
        ) : <span />}
        <Link href={cfg.hubHref} className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`${cfg.hubHref}/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
