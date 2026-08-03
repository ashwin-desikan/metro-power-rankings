import type { Metadata } from "next";
import Link from "next/link";
import {
  getCaElections,
  computeCaRecords,
  caPartyColor,
  CA_TWO_PARTY,
  fmtInt,
  fmtPct,
  type CaElection,
} from "@/lib/caElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { HubTitle } from "../HubShared";
import LineChart, { type ChartSeries } from "../LineChart";

const PATH = "/elections/ca";
const TITLE = "Canadian Federal Elections";
const DESC =
  "Every Canadian federal election from Confederation in 1867 to 2025: the results, the leaders, the turnout, the governments they made, and the story of each — from Macdonald's Dominion to the 45th Parliament.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

// ---------- small pieces ----------
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)] tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function SeatStrip({ e }: { e: CaElection }) {
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const known = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const rest = Math.max(0, e.totalSeats - known);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
      {withSeats.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          style={{
            width: `${((p.seats ?? 0) / e.totalSeats) * 100}%`,
            backgroundColor: caPartyColor(p.name),
            marginRight: i < withSeats.length - 1 || rest > 0 ? 1 : 0,
          }}
          title={`${p.name}: ${p.seats} seats`}
        />
      ))}
      {rest > 0 ? <div style={{ width: `${(rest / e.totalSeats) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Others / not shown: ${rest} seats`} /> : null}
    </div>
  );
}

// ---------- page ----------
export default function CaElectionsPage() {
  const { eras, elections, meta } = getCaElections();
  const records = computeCaRecords();
  const last = elections[elections.length - 1];

  // Newest era first, and newest election first within each era.
  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }));

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const twoPartyOf = (e: CaElection, kind: "votes" | "seats"): number | null => {
    const dp = e.parties.filter((p) => p.name != null && CA_TWO_PARTY.has(p.name));
    if (kind === "votes") {
      const known = dp.filter((p) => p.share != null);
      return known.length ? known.reduce((s, p) => s + (p.share ?? 0), 0) : null;
    }
    const seats = dp.reduce((s, p) => s + (p.seats ?? 0), 0);
    return e.totalSeats ? (seats / e.totalSeats) * 100 : null;
  };
  const twoPartyVotes: ChartSeries = {
    name: "Vote share",
    color: "#8A7CA8",
    points: elections
      .map((e) => ({ x: e.year, y: twoPartyOf(e, "votes"), label: e.label }))
      .filter((p): p is { x: number; y: number; label: string } => p.y != null),
  };
  const twoPartySeats: ChartSeries = {
    name: "Seat share",
    color: "#4ECDC4",
    points: elections
      .map((e) => ({ x: e.year, y: twoPartyOf(e, "seats"), label: e.label }))
      .filter((p): p is { x: number; y: number; label: string } => p.y != null),
  };
  const thirdForces: ChartSeries[] = (
    [
      ["CCF / NDP", caPartyColor("New Democratic"), ["CCF", "New Democratic"]],
      ["Bloc Québécois", caPartyColor("Bloc Québécois"), ["Bloc Québécois"]],
      ["Progressive", caPartyColor("Progressive"), ["Progressive"]],
      ["Social Credit", caPartyColor("Social Credit"), ["Social Credit", "Ralliement créditiste"]],
      ["Reform / Alliance", caPartyColor("Reform"), ["Reform", "Canadian Alliance"]],
    ] as const
  ).map(([name, color, keys]) => ({
    name,
    color,
    points: elections
      .map((e) => {
        const seats = e.parties.filter((p) => p.name != null && (keys as readonly string[]).includes(p.name)).reduce((s, p) => s + (p.seats ?? 0), 0);
        return { x: e.year, y: seats, label: e.label };
      })
      .filter((p) => p.y > 0),
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Canada</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ca" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Commons seats today" value={fmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Minority parliaments" value={String(elections.filter((e) => e.government?.type === "minority").length)} hint="of 45 elections — a Canadian specialty" />
      </div>

      {/* jump nav */}
      <div className="flex flex-wrap gap-2 mb-10 text-xs">
        {[
          ["#chronology", "Chronology"],
          ["#charts", "The long arc in charts"],
          ["#records", "Records"],
          ["#how-it-works", "How it works"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border px-3 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)" }}>
            {label}
          </a>
        ))}
      </div>

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The chronology</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every federal election, newest first, grouped into eight eras. Click any election for the full
          result, the party table and the story.
        </p>
        {byEra.map(({ era, list }) => (
          <div key={era.key} id={`era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => {
                const winner = e.parties.find((p) => p.name === e.seatLeader) ?? e.parties[0];
                return (
                  <Link
                    key={e.id}
                    href={`/elections/ca/${e.id}`}
                    className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-[var(--text)]">{e.label}</span>
                        {e.knownAs ? (
                          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                            {e.knownAs}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
                        {winner && winner.seats != null ? (
                          <span>
                            <span style={{ color: caPartyColor(winner.name) }}>{winner.name}</span>{" "}
                            {winner.seats}/{e.totalSeats}
                          </span>
                        ) : null}
                        {e.turnout != null ? <span>turnout {fmtPct(e.turnout)}</span> : null}
                        {e.pmAfter ? <span>PM: {e.pmAfter.name}</span> : null}
                      </div>
                    </div>
                    <SeatStrip e={e} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          A century and a half of results in four pictures. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1867–2025</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Peaks near 80% in the Diefenbaker–Pearson battles of 1958–63; the floor is 58.8% in 2008.
              The 2025 election drew the highest turnout since 1993.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The two-party grip</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Liberal + Conservative-family share of votes versus seats. Near-total before 1921, shattered
              by the Progressives, at its weakest in the divided-right 1990s, and roaring back above 85% of
              the vote in 2025.
            </p>
            <LineChart series={[twoPartySeats, twoPartyVotes]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4 lg:col-span-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The third forces</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Seats won by the movements that broke the duopoly: the Progressives&apos; 1921 revolt, Social
              Credit and the CCF from the Depression, Réal Caouette&apos;s créditistes, Reform and the Bloc
              from the 1993 collapse, and the NDP&apos;s 2011 orange wave — followed by the near-extinction
              of them all in 2025.
            </p>
            <LineChart series={thirdForces} yMax={110} yTicks={[25, 50, 75, 100]} unit="" />
          </div>
          <div className="rounded-xl border p-4 lg:col-span-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Votes versus seats, {last.year}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Each bar pair shows a party&apos;s vote share (muted) against its seat share (solid) —
              first-past-the-post rewards the concentrated Bloc vote and punishes the spread-out NDP vote.
            </p>
            <div className="space-y-2 mt-3">
              {last.parties.slice(0, 5).map((p) => {
                const seatPct = p.seats != null ? (p.seats / last.totalSeats) * 100 : null;
                return (
                  <div key={p.name ?? ""}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-[var(--text)]">{p.name}</span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {fmtPct(p.share)} votes → {seatPct != null ? fmtPct(seatPct) : "—"} seats
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-0.5" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.share ?? 0}%`, backgroundColor: caPartyColor(p.name), opacity: 0.45 }} />
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${seatPct ?? 0}%`, backgroundColor: caPartyColor(p.name) }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- records ---------- */}
      <section id="records" className="mb-12">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">Records &amp; superlatives</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((r) => (
            <Link
              key={r.label}
              href={`/elections/ca/${r.electionId}`}
              className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{r.label}</p>
              <p className="text-xl font-bold text-[var(--text)] tabular-nums">{r.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how-it-works" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">How Canadian federal elections work</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["First past the post", "One MP per riding; the candidate with the most votes wins. As in Britain, the system rewards regionally concentrated parties — the Bloc's Quebec fortress — and punishes evenly spread support like the NDP's."],
            ["343 ridings", "The House of Commons has grown with the country, from 180 seats in 1867 to 343 in 2025. Seats are redistributed after each census, with floors guaranteeing smaller provinces their historic representation."],
            ["The timetable", "Parliaments run a maximum of five years, with fixed election dates every four years since 2007 — though a Prime Minister can still seek early dissolution, and minority parliaments rarely last half their term."],
            ["Minority rule, often", "No country does minority government more: 16 of 45 elections left the governing party short of the majority line. Conventions matter — in 1925 Mackenzie King governed from second place, a precedent every hung parliament since has invoked."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <p className="font-bold text-[var(--text)] mb-1">{h}</p>
              <p className="text-xs text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-[var(--text-dim)] border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p>Sources: {meta.sources.join("; ")}.</p>
        <p className="mt-1">
          See also{" "}
          <Link href="/countries/canada" className="text-[var(--accent)] hover:underline">Canada</Link>
          {" · "}
          <Link href="/elections/uk" className="text-[var(--accent)] hover:underline">UK General Elections</Link>
          {" · "}
          <Link href="/elections/us" className="text-[var(--accent)] hover:underline">US Presidential Elections</Link>
          {" · "}
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
        </p>
      </footer>
    </main>
  );
}
