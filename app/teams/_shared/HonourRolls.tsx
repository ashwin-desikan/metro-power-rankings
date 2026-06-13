import Link from "next/link";

// Shared winners-only honour-roll renderer for domestic competitions tracked as
// champions lists only (handball/volleyball/basketball/hockey domestic, cricket
// county, British rugby league). Takes plain data props, so it imports nothing
// server-only and can live next to any hub. Mirrors the Domestic Rugby grid.

type Row = { season: string; winner: string; ru: string | null };
type Portal = {
  labels: Record<string, string>;
  rolls: Record<string, Row[]>;
  most_titled: Record<string, { winner: string; titles: number }[]>;
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function HonourRolls({
  portal,
  order,
}: {
  portal: Portal;
  order?: string[];
}) {
  const keys = (order ?? Object.keys(portal.rolls)).filter((k) => portal.rolls[k]?.length);
  const multi = keys.length > 1;
  return (
    <div className={`grid grid-cols-1 ${multi ? "md:grid-cols-2" : ""} gap-3 mb-10`}>
      {keys.map((k) => (
        <section key={k} className="rounded-xl border p-4" style={card}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 id={k} className="font-semibold">{portal.labels[k] ?? k}</h2>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums" style={mono}>
              {portal.rolls[k].length} seasons
            </span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mb-2">
            Most titled:{" "}
            {(portal.most_titled[k] ?? []).slice(0, 3).map((m, i) => (
              <span key={m.winner}>
                {i > 0 ? " · " : ""}
                <span className="font-medium text-[var(--text)]">{m.winner}</span>
                <span style={mono}> {m.titles}</span>
              </span>
            ))}
          </div>
          <div className="overflow-y-auto max-h-[340px]">
            <table className="w-full text-xs">
              <tbody>
                {portal.rolls[k].map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 pr-2 tabular-nums whitespace-nowrap align-top" style={mono}>{r.season}</td>
                    <td className="py-1 pr-2 font-medium">{r.winner}</td>
                    <td className="py-1 text-[var(--text-dim)] hidden sm:table-cell">{r.ru ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
