import { flagCdnUrl } from "@/lib/international-display";
import type { BarbariansData } from "@/lib/barbarians";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const OVERRIDE: Record<string, string> = { "Ivory Coast": "ivory-coast", "Western Samoa": "samoa" };
// Opponents that are not nations get no flag.
const NON_NATION = new Set(["British Lions", "East Africa", "Rhodesia", "The Rest", "Combined Services"]);

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function Flag({ opponent }: { opponent: string }) {
  if (NON_NATION.has(opponent)) return null;
  const url = flagCdnUrl(OVERRIDE[opponent] ?? slugify(opponent));
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px] flex-shrink-0" />;
}

const rColor = (r: "W" | "L" | "D") => (r === "W" ? "#10b981" : r === "L" ? "var(--text-muted)" : "var(--text-dim)");
const rLabel = (r: "W" | "L" | "D") => (r === "W" ? "Won" : r === "L" ? "Lost" : "Draw");

export default function BarbariansHistory({ data }: { data: BarbariansData }) {
  const o = data.overall;
  const top = data.byOpponent.filter((x) => x.P >= 5).slice(0, 6);
  return (
    <section id="barbarians" className="mb-10 scroll-mt-20">
      <h2 className="text-xl font-bold mb-1">Barbarian F.C.</h2>
      <p className="text-[var(--text-muted)] text-sm max-w-3xl mb-4">
        An invitational club with no home nation, fielding guest players from around the world against
        Test sides since 1915, most famously the 1973 win over the All Blacks. All-time versus national
        teams: <span className="tabular-nums" style={mono}>{o.W}W {o.L}L{o.D ? ` ${o.D}D` : ""}</span> from {o.P}.
      </p>

      {top.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {top.map((x) => (
            <div key={x.opponent} className="text-xs rounded-full border px-3 py-1" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <Flag opponent={x.opponent} /><span className="text-[var(--text)]">{x.opponent}</span>{" "}
              <span className="text-[var(--text-muted)] tabular-nums" style={mono}>{x.W}-{x.L}{x.D ? `-${x.D}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto max-h-[460px] overflow-y-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm min-w-[480px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Year</th>
              <th className="py-2 px-3 font-medium">Opponent</th>
              <th className="py-2 px-3 font-medium text-right">Score</th>
              <th className="py-2 px-3 font-medium">Result</th>
              <th className="py-2 px-3 font-medium">Venue</th>
            </tr>
          </thead>
          <tbody>
            {data.matches.map((m, i) => (
              <tr key={`${m.date}-${m.opponent}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)]" style={mono}>{m.year ?? ""}</td>
                <td className="py-1.5 px-3 whitespace-nowrap"><Flag opponent={m.opponent} />{m.opponent}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{m.for}-{m.against}</td>
                <td className="py-1.5 px-3 font-medium" style={{ color: rColor(m.result) }}>{rLabel(m.result)}</td>
                <td className="py-1.5 px-3 text-[var(--text-muted)] truncate max-w-[14rem]">{m.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">Men&apos;s matches against international sides. Score is Barbarians for and against.</p>
    </section>
  );
}
