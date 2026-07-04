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
      {/* Quick links — the Live Hub shortcuts (standings, champions, the Cup). */}
      <div className="flex flex-col gap-1.5 mb-3">
        <Link href="/sports/standings" className="flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.08)" }}>
          <span aria-hidden className="inline-block rounded-full flex-shrink-0" style={{ width: 9, height: 9, background: "#10b981" }} />
          <span className="text-[12px] font-semibold" style={{ color: "#10b981" }}>Live Standings</span>
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{liveCount} live now</span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)]">&rarr;</span>
        </Link>
        <Link href="/sports/champions" className="flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "rgba(212,175,55,0.4)", background: "rgba(212,175,55,0.08)" }}>
          <span aria-hidden className="text-sm leading-none">&#128081;</span>
          <span className="text-[12px] font-semibold" style={{ color: "#d4af37" }}>Champions</span>
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>current &amp; all-time</span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)]">&rarr;</span>
        </Link>
        <Link href="/sports/zone-zero-cup" className="flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "rgba(212,175,55,0.4)", background: "rgba(212,175,55,0.08)" }}>
          <span aria-hidden className="text-sm leading-none">&#127942;</span>
          <span className="text-[12px] font-semibold" style={{ color: "#d4af37" }}>Zone Zero Cup</span>
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>national merit</span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)]">&rarr;</span>
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
        <Legend color={DOT.regular} label="In season" />
        <Legend color={DOT.playoffs} label="Playoffs" />
        <Legend color={DOT.worldcup} label="World Cup" />
        <Legend color={DOT.offseason} label="Offseason" />
      </div>

      <div>
        {groups.filter((g) => g.family !== "Golf" && g.family !== "Tennis").map((g) => {
          const isSelf = g.entries.length === 1 && boardLabelFor(g.entries[0]) === g.family;
          return (
            <div key={g.family} className="flex items-start gap-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex-none text-[10px] tracking-widest uppercase pt-1.5" style={{ width: 80, color: "var(--text-dim)", ...mono }}>
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
              <div className="flex-none pt-1.5" style={{ width: 80 }} aria-hidden />
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
