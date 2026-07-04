import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, type LeagueStatus } from "@/lib/leagueStatus";
import { catalogByFamily, boardLabelFor, type CatalogEntry } from "@/lib/sportsCatalog";

// The "Live Hub": a compact league board. One row per sport, its leagues as
// status-dot chips, so a single glance tells you what's live. Colour carries the
// state (green in season, amber playoffs, purple World Cup, grey off); the two
// special states also spell out on the chip. Breadth is the point, so nothing
// collapses. Server component; status computed at render. subRoll sub-portals
// are kept off the board.

const CLUB_FOOTBALL_HREF = "/teams/football";
const DOT: Record<string, string> = {
  regular: "#1D9E75",
  playoffs: "#EF9F27",
  worldcup: "#7F77DD",
  champion: "#D4AF37",
  offseason: "#55556A",
};
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function statusFor(href: string): LeagueStatus | null {
  return href === CLUB_FOOTBALL_HREF ? clubFootballStatus() : leagueStatusFor(href);
}
function shortStatus(s: LeagueStatus): string {
  return s.label.replace(/^Live\s*-\s*/, "");
}

function Chip({ entry, text }: { entry: CatalogEntry; text: string }) {
  const s = statusFor(entry.href);
  const tone = s?.tone ?? "offseason";
  const color = DOT[tone] ?? DOT.offseason;
  const special = tone === "playoffs" || tone === "worldcup";
  return (
    <Link
      href={entry.href}
      title={s?.label ?? "Offseason"}
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      <span className="inline-block rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: color }} aria-hidden="true" />
      {text}
      {special && s && (
        <span className="text-[10px] font-medium whitespace-nowrap" style={{ color }}>{shortStatus(s)}</span>
      )}
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export default function SportsLiveBoard() {
  const groups = catalogByFamily(false)
    .map((g) => ({ family: g.family, entries: g.entries.filter((e) => !e.subRoll) }))
    .filter((g) => g.entries.length > 0);
  const liveCount = groups.reduce(
    (n, g) => n + g.entries.filter((e) => { const s = statusFor(e.href); return !!s && s.tone !== "offseason"; }).length,
    0,
  );

  return (
    <div className="rounded-lg border p-3.5" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
          <Legend color={DOT.regular} label="In season" />
          <Legend color={DOT.playoffs} label="Playoffs" />
          <Legend color={DOT.worldcup} label="World Cup" />
          <Legend color={DOT.offseason} label="Offseason" />
        </div>
        <Link
          href="/sports/standings"
          className="inline-flex items-center gap-1.5 text-[11px] rounded-full border px-2.5 py-1 transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.08)", color: "#10b981", ...mono }}
        >
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: "#10b981" }} aria-hidden="true" />
          {liveCount} live &middot; standings &rarr;
        </Link>
      </div>

      <div>
        {groups.filter((g) => g.family !== "Golf" && g.family !== "Tennis").map((g) => {
          const isSelf = g.entries.length === 1 && boardLabelFor(g.entries[0]) === g.family;
          return (
            <div key={g.family} className="flex items-start gap-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex-none text-[10px] tracking-widest uppercase pt-1.5" style={{ width: 92, color: "var(--text-dim)", ...mono }}>
                {isSelf ? "" : g.family}
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {isSelf ? (
                  <Chip entry={g.entries[0]} text={g.family} />
                ) : (
                  g.entries.map((e) => <Chip key={e.href} entry={e} text={boardLabelFor(e)} />)
                )}
              </div>
            </div>
          );
        })}
        {(() => {
          const gt = groups.filter((g) => g.family === "Golf" || g.family === "Tennis").flatMap((g) => g.entries);
          if (gt.length === 0) return null;
          return (
            <div className="flex items-start gap-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex-none pt-1.5" style={{ width: 92 }} aria-hidden />
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {gt.map((e) => <Chip key={e.href} entry={e} text={e.label} />)}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
