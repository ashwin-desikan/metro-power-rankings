import type { NflEloTeam, NflHonour } from "@/lib/nflElo";

// The six year-end honours the workbook records, as one 6-slot strip.
//
// 🔴 SIX SLOTS, NOT SIX COLUMNS. Ashwin asked for playoff appearance, division
// title, best conference record, conference final, championship appearance and
// championship on every standings row, and warned it must not look busy. Six
// extra columns of "Y" would be 32 rows x 6 words of noise for a signal that is
// binary and ORDERED, so it renders as one escalating strip: a filled square
// means earned, a hollow one means not. Reading across is reading a career-best
// season from left to right, and reading down a column still compares teams.
//
// 🔴 THE RAMP IS SEQUENTIAL BECAUSE THE HONOURS ARE. --seq-1..5 is the site's
// ordered ramp and it ends in the championship gold used by TITLE_COLORS, so
// the strip encodes escalation in lightness as well as position. It is never
// the only channel: position is fixed, and every strip carries a text label.

export const HONOURS: { key: NflHonour; short: string; label: string; color: string }[] = [
  { key: "play_app",  short: "P", label: "made the playoffs",          color: "var(--seq-1)" },
  { key: "div_title", short: "D", label: "won its division",           color: "var(--seq-2)" },
  { key: "best_conf", short: "C", label: "best record in conference",  color: "var(--seq-3)" },
  { key: "cf_app",    short: "F", label: "reached the conference final", color: "var(--seq-4)" },
  { key: "champ_app", short: "A", label: "reached the championship game", color: "var(--seq-5)" },
  { key: "champ",     short: "W", label: "won the championship",       color: "#D4AF37" },
];

/** True when any team in the season carries any honour: pre-1933 has none. */
export function seasonHasHonours(teams: NflEloTeam[]): boolean {
  return teams.some((t) => HONOURS.some((h) => t.flags?.[h.key]));
}

export default function HonoursStrip({ team }: { team: NflEloTeam }) {
  const f = team.flags ?? {};
  const earned = HONOURS.filter((h) => f[h.key]);
  const words = earned.length
    ? `${team.team ?? team.name} ${earned.map((h) => h.label).join(", ")}`
    : `${team.team ?? team.name} won no year-end honours`;
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" title={words}>
      <span className="sr-only">{words}</span>
      {HONOURS.map((h) => (
        <span
          key={h.key}
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            display: "inline-block",
            background: f[h.key] ? h.color : "transparent",
            border: f[h.key] ? "none" : "1px solid var(--border)",
          }}
        />
      ))}
    </span>
  );
}

/** The strip's key, printed once per table rather than once per row. */
export function HonoursLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--text-dim)]">
      {HONOURS.map((h) => (
        <span key={h.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: h.color, display: "inline-block" }} />
          {h.label.replace(/^(made|won|reached) (the )?/, "")}
        </span>
      ))}
    </div>
  );
}
