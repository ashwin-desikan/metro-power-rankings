import Link from "next/link";
import SortableTable from "./SortableTable";
import { DetailPager } from "./HubShared";
import { warsDuringElection, warLabel } from "@/lib/electionConflicts";

// Shared detail-page renderer for presidential contests (Mexico, Brazil —
// France keeps its earlier inline version). Handles single-round votes,
// two-round runoffs and indirect/managed contests with a caveat box.

export type PresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PresElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type PresDetailConfig = {
  hubHref: string;
  hubName: string;
  headingSuffix: string; // "Mexican Presidential Election"
  eraAnchorPrefix: string; // "pres-era-"
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

export default async function PresElectionDetail({
  e,
  era,
  prev,
  next,
  cfg,
}: {
  e: PresElection;
  era: { key: string; label: string } | null;
  prev: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
  cfg: PresDetailConfig;
}) {
  const wars = await warsDuringElection(cfg.hubHref, e.year);
  const twoRounds = e.candidates.some((c) => c.r2Share != null);
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href={cfg.hubHref} className="hover:underline">{cfg.hubName}</Link>
        {" / "}
        <span>{e.label} presidential</span>
      </nav>

      <DetailPager hubHref={cfg.hubHref} hubName={cfg.hubName} prev={prev} next={next} suffix="presidential" />

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
              <Link href={`${cfg.hubHref}#${cfg.eraAnchorPrefix}${era.key}`} className="hover:text-[var(--accent)]">{era.label}</Link>
            </>
          ) : null}
          {twoRounds ? " · two-round vote" : null}
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

      {e.caveat ? (
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          {e.caveat}
        </p>
      ) : null}

      {/* runoff strip */}
      {twoRounds && byR2.length >= 2 && byR2[0].r2Share != null && byR2[1].r2Share != null ? (
        <div className="mb-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div style={{ width: `${byR2[0].r2Share}%`, backgroundColor: cfg.colorOf(byR2[0].party), marginRight: 2 }} title={`${byR2[0].name}: ${cfg.fmtPct(byR2[0].r2Share)}`} />
            <div style={{ width: `${byR2[1].r2Share}%`, backgroundColor: cfg.colorOf(byR2[1].party) }} title={`${byR2[1].name}: ${cfg.fmtPct(byR2[1].r2Share)}`} />
          </div>
          <div className="relative h-2">
            <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: "50%" }} title="50%" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact label="President before" value={e.presBefore ? e.presBefore.name : "—"} sub={e.presBefore?.party ?? undefined} />
        <Fact
          label={e.presBefore && e.presAfter && e.presBefore.name === e.presAfter.name ? "President (re-elected)" : "Elected President"}
          value={e.presAfter ? e.presAfter.name : "—"}
          sub={e.presAfter?.party ?? undefined}
        />
        <Fact
          label="Winning share"
          value={winner ? cfg.fmtPct(winner.r2Share ?? winner.r1Share) : "—"}
          sub={winner ? (winner.r2Share != null ? "second round" : undefined) : undefined}
        />
        <Fact
          label="Turnout"
          value={cfg.fmtPct(e.turnout)}
          sub={e.turnout2 != null ? `second round ${cfg.fmtPct(e.turnout2)}` : undefined}
        />
      </div>

      {/* candidates table */}
      {e.candidates.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The result</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-sm"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "candidate", label: "Candidate", className: "px-3 py-2" },
                { key: "party", label: "Party", className: "px-3 py-2" },
                { key: "r1v", label: twoRounds ? "First-round votes" : "Votes", className: "px-3 py-2 text-right" },
                { key: "r1s", label: twoRounds ? "First round" : "Share", className: "px-3 py-2 text-right" },
                ...(twoRounds
                  ? [
                      { key: "r2v", label: "Second-round votes", className: "px-3 py-2 text-right" },
                      { key: "r2s", label: "Second round", className: "px-3 py-2 text-right" },
                    ]
                  : []),
              ]}
              rows={e.candidates.map((c, i) => ({
                key: `${c.name}-${i}`,
                sort: { candidate: c.name, party: c.party, r1v: c.r1Votes, r1s: c.r1Share, r2v: c.r2Votes, r2s: c.r2Share },
                cells: (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-[var(--text)]">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: cfg.colorOf(c.party) }} />
                      {c.name}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{c.party ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{cfg.fmtInt(c.r1Votes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{cfg.fmtPct(c.r1Share, 2)}</td>
                    {twoRounds ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{cfg.fmtInt(c.r2Votes)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">
                          {c.r2Share != null ? cfg.fmtPct(c.r2Share, 2) : "—"}
                        </td>
                      </>
                    ) : null}
                  </>
                ),
              }))}
            />
          </div>
        </section>
      ) : (
        <p className="text-sm text-[var(--text-dim)] mb-8 max-w-3xl">
          The surviving record for this contest does not include a candidate-by-candidate table; the story
          above is what the sources support.
        </p>
      )}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`${cfg.hubHref}/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label} presidential
          </Link>
        ) : <span />}
        <Link href={cfg.hubHref} className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`${cfg.hubHref}/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} presidential →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
