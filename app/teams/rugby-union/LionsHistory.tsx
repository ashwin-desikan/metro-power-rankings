import { flagCdnUrl } from "@/lib/international-display";
import type { LionsData } from "@/lib/lions";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const FLAG: Record<string, string> = { "New Zealand": "new-zealand", "South Africa": "south-africa", Australia: "australia" };
const BIG3 = ["New Zealand", "South Africa", "Australia"];

function Flag({ nation }: { nation: string }) {
  const url = flagCdnUrl(FLAG[nation] ?? "");
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px] flex-shrink-0" />;
}

const seriesLabel = (s: "W" | "L" | "D") => (s === "W" ? "won" : s === "L" ? "lost" : "drawn");
const seriesColor = (s: "W" | "L" | "D") => (s === "W" ? "#10b981" : s === "L" ? "var(--text-muted)" : "var(--text-dim)");

export default function LionsHistory({ data }: { data: LionsData }) {
  const tours = new Set(data.series.map((s) => s.year)).size;

  return (
    <section id="lions" className="mb-10 scroll-mt-20">
      <h2 className="text-xl font-bold mb-1">British &amp; Irish Lions</h2>
      <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
        A composite of England, Scotland, Wales and Ireland that tours the southern hemisphere every four
        years. Not a ranked nation, so it sits apart from the international table: {tours} Test tours of
        New Zealand, South Africa and Australia since 1888.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {BIG3.map((opp) => {
          const r = data.allTime[opp];
          if (!r) return null;
          return (
            <div key={opp} className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="text-sm font-semibold mb-1"><Flag nation={opp} />{opp}</div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums" style={mono}>
                Tests: {r.W}W {r.L}L{r.D ? ` ${r.D}D` : ""} of {r.P}
              </div>
              <div className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5" style={mono}>
                Series: {r.seriesW}W {r.seriesL}L{r.seriesD ? ` ${r.seriesD}D` : ""}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="text-xs uppercase tracking-wide font-semibold text-[var(--text-muted)] mb-1.5">Test series</h3>
      <div className="rounded-xl border overflow-x-auto max-h-[420px] overflow-y-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm min-w-[360px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Year</th>
              <th className="py-2 px-3 font-medium">Host</th>
              <th className="py-2 px-3 font-medium text-right">Tests</th>
              <th className="py-2 px-3 font-medium">Series</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => (
              <tr key={`${s.year}-${s.opponent}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)]" style={mono}>{s.year}</td>
                <td className="py-1.5 px-3 whitespace-nowrap"><Flag nation={s.opponent} />{s.opponent}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{s.w}-{s.l}{s.d ? `-${s.d}` : ""}</td>
                <td className="py-1.5 px-3 font-medium" style={{ color: seriesColor(s.series) }}>{seriesLabel(s.series)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        Test matches only (tour and midweek games excluded). Series result is the Lions&apos; record across that tour&apos;s Tests against the host.
      </p>
    </section>
  );
}
