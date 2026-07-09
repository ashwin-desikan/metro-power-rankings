import Link from "next/link";

// State of Origin interstate series (NSW v Queensland), 1982-present. Curated
// from the public record; add a row per completed series. The current series
// (one year beyond the last row) is shown as "in progress".
type Series = { year: number; winner: "QLD" | "NSW" | "Draw"; w: number; l: number; d: number; shield: "QLD" | "NSW" };

const SERIES: Series[] = [
  { year: 1982, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1983, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1984, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1985, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1986, winner: "NSW", w: 3, l: 0, d: 0, shield: "NSW" },
  { year: 1987, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1988, winner: "QLD", w: 3, l: 0, d: 0, shield: "QLD" },
  { year: 1989, winner: "QLD", w: 3, l: 0, d: 0, shield: "QLD" },
  { year: 1990, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1991, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1992, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1993, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1994, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1995, winner: "QLD", w: 3, l: 0, d: 0, shield: "QLD" },
  { year: 1996, winner: "NSW", w: 3, l: 0, d: 0, shield: "NSW" },
  { year: 1997, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 1998, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 1999, winner: "Draw", w: 1, l: 1, d: 1, shield: "QLD" },
  { year: 2000, winner: "NSW", w: 3, l: 0, d: 0, shield: "NSW" },
  { year: 2001, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2002, winner: "Draw", w: 1, l: 1, d: 1, shield: "QLD" },
  { year: 2003, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2004, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2005, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2006, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2007, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2008, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2009, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2010, winner: "QLD", w: 3, l: 0, d: 0, shield: "QLD" },
  { year: 2011, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2012, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2013, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2014, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2015, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2016, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2017, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2018, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2019, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2020, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2021, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2022, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2023, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2024, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
  { year: 2025, winner: "QLD", w: 2, l: 1, d: 0, shield: "QLD" },
  { year: 2026, winner: "NSW", w: 2, l: 1, d: 0, shield: "NSW" },
];

const TEAMS = {
  QLD: { name: "Queensland", href: "/states/queensland", color: "#7A1730" },
  NSW: { name: "New South Wales", href: "/states/new-south-wales", color: "#0093D0" },
} as const;

function StateLink({ code, short = false }: { code: "QLD" | "NSW"; short?: boolean }) {
  const t = TEAMS[code];
  return (
    <Link href={t.href} className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} aria-hidden />
      {short ? code : t.name}
    </Link>
  );
}

export default function StateOfOrigin() {
  const qld = SERIES.filter((s) => s.winner === "QLD").length;
  const nsw = SERIES.filter((s) => s.winner === "NSW").length;
  const drawn = SERIES.filter((s) => s.winner === "Draw").length;
  const last = SERIES[SERIES.length - 1];
  const inProgress = last.year + 1;
  const rows = [...SERIES].reverse();

  const card = "rounded-xl border px-4 py-3 flex items-center gap-2.5";
  return (
    <section id="origin" className="mb-12">
      <h2 className="text-xl font-bold mb-2">State of Origin</h2>
      <p className="text-[var(--text-muted)] max-w-3xl text-sm mb-4">
        Rugby league&apos;s interstate series and the fiercest rivalry in Australian sport: <StateLink code="NSW" /> against{" "}
        <StateLink code="QLD" />, a best-of-three contested every winter since 1982 for the State of Origin shield. The{" "}
        <strong className="text-[var(--text)]">{inProgress}</strong> series is in progress.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={card} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: TEAMS.QLD.color }} aria-hidden />
          <div><div className="text-lg font-bold tabular-nums">{qld}</div><div className="text-[11px] text-[var(--text-muted)]">QLD series</div></div>
        </div>
        <div className={card} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: TEAMS.NSW.color }} aria-hidden />
          <div><div className="text-lg font-bold tabular-nums">{nsw}</div><div className="text-[11px] text-[var(--text-muted)]">NSW series</div></div>
        </div>
        <div className={card} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div><div className="text-lg font-bold tabular-nums">{drawn}</div><div className="text-[11px] text-[var(--text-muted)]">drawn (shield held)</div></div>
        </div>
        <div className={card} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div><div className="text-sm font-bold">{TEAMS[last.shield].name === "New South Wales" ? "NSW" : "Queensland"}</div><div className="text-[11px] text-[var(--text-muted)]">shield holder ({last.year})</div></div>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm tabular-nums min-w-[440px]">
          <thead>
            <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <th className="text-left py-2 px-3 font-medium">Year</th>
              <th className="text-left py-2 px-3 font-medium">Series winner</th>
              <th className="text-right py-2 px-3 font-medium">Result (W-L-D)</th>
              <th className="text-left py-2 px-3 font-medium">Shield holder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.year} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 text-[var(--text-muted)]">{s.year}</td>
                <td className="py-1.5 px-3 font-medium">
                  {s.winner === "Draw" ? <span className="text-[var(--text-dim)]">Drawn series</span> : <StateLink code={s.winner} />}
                </td>
                <td className="py-1.5 px-3 text-right text-[var(--text-muted)]">{s.w}-{s.l}{s.d ? `-${s.d}` : ""}</td>
                <td className="py-1.5 px-3"><StateLink code={s.shield} short /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        Series result is the winner&apos;s match record across the three games. A drawn series (1999, 2002) leaves the shield with its current holder.
      </p>
    </section>
  );
}
