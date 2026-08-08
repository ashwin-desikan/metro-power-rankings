import { Fragment } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

// Shared winners-only honour-roll renderer for domestic competitions tracked as
// champions lists only (handball/volleyball/basketball/hockey domestic, cricket
// county, British rugby league). Takes plain data props, so it imports nothing
// server-only and can live next to any hub. Mirrors the Domestic Rugby grid.

type Row = { season: string; winner: string; ru: string | null; era?: string | null };

// Rolls are stored oldest-first and grouped into era blocks (oldest block
// first), so reversing yields newest season of the newest competition down to
// the oldest season of the oldest. An era changes exactly at a block boundary,
// which is where the labelled rule goes.
function eraChanged(rows: Row[], i: number) {
  if (i === 0) return false;
  return (rows[i].era ?? null) !== (rows[i - 1].era ?? null);
}
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
  links,
}: {
  portal: Portal;
  order?: string[];
  // Optional winner/runner-up name -> href map. When a club has a page (e.g. a
  // Below the Line club), its name in the roll renders as a link.
  links?: Record<string, string>;
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
                <span className="font-medium text-[var(--text)]"><CrestIcon name={m.winner} size={13} className="mr-1 align-[-2px]" />{m.winner}</span>
                <span style={mono}> {m.titles}</span>
              </span>
            ))}
          </div>
          {/* Mobile: one row-card per season instead of a table that hides
              the runner-up entirely below sm. Same reversed rolls array. */}
          <div className="sm:hidden overflow-y-auto space-y-1" style={{ maxHeight: 340 }}>
            {[...portal.rolls[k]].reverse().map((r, i, rows) => (
              <div key={`${r.season}-${i}-card`}>
              {eraChanged(rows, i) ? (
                <div className="flex items-center gap-2 pt-2.5 pb-1" aria-hidden={false}>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{r.era}</span>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-2 py-1 border-t text-xs" style={{ borderColor: "var(--border)" }}>
                <span className="tabular-nums whitespace-nowrap text-[var(--text-dim)] flex-shrink-0" style={mono}>{r.season}</span>
                <span className="flex-1 min-w-0 text-right">
                  <span className="inline-flex items-center gap-1.5 font-medium justify-end">
                    <CrestIcon name={r.winner} size={16} />
                    {links?.[r.winner] ? (
                      <Link href={links[r.winner]} className="hover:text-[var(--accent)] hover:underline">{r.winner}</Link>
                    ) : r.winner}
                  </span>
                  {r.ru && (
                    <span className="block text-[10px] text-[var(--text-dim)] mt-0.5">
                      vs {links?.[r.ru] ? (
                        <Link href={links[r.ru]} className="hover:text-[var(--accent)] hover:underline">{r.ru}</Link>
                      ) : r.ru}
                    </span>
                  )}
                </span>
              </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-y-auto" style={{ overflowX: "auto", maxHeight: 340 }}>
            <table className="w-full text-xs">
              <tbody>
                {/* Rolls are stored oldest-first in the ETL; render newest-first
                    to match every other season-by-season table on the site. */}
                {[...portal.rolls[k]].reverse().map((r, i, rows) => (
                  <Fragment key={`${r.season}-${i}`}>
                  {eraChanged(rows, i) ? (
                    <tr>
                      <td colSpan={3} className="pt-3 pb-1">
                        <span className="flex items-center gap-2">
                          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                          <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] whitespace-nowrap">{r.era}</span>
                          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1 pr-2 tabular-nums whitespace-nowrap align-top" style={mono}>{r.season}</td>
                    <td className="py-2 pr-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <CrestIcon name={r.winner} size={16} />
                        {links?.[r.winner] ? (
                          <Link href={links[r.winner]} className="hover:text-[var(--accent)] hover:underline">{r.winner}</Link>
                        ) : r.winner}
                      </span>
                    </td>
                    <td className="py-2 text-[var(--text-dim)] hidden sm:table-cell">
                      {r.ru ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CrestIcon name={r.ru} size={16} />
                          {links?.[r.ru] ? (
                            <Link href={links[r.ru]} className="hover:text-[var(--accent)] hover:underline">{r.ru}</Link>
                          ) : r.ru}
                        </span>
                      ) : ""}
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
