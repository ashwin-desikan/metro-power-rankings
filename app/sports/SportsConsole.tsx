import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, type LeagueStatus } from "@/lib/leagueStatus";
import { catalogByFamily, boardLabelFor, type CatalogEntry } from "@/lib/sportsCatalog";

// Sticky sidebar for /sports. One row per sport (canonical workbook names),
// the sport label anchored on the left and its leagues as status-dot chips on
// the right, so a chip like "International" is never orphaned. Breadth is the
// point, so nothing collapses; colour tells you what is live. The two special
// states (playoffs = amber, World Cup = purple) are also spelled out on the
// chip, since colour alone is not obvious. Wraps to one column on mobile.
// Server component: status is computed at render, chips are plain links.
// Domestic winners-roll sub-portals (subRoll) are kept off this board.

export type ConsoleDeepDive = { href: string; title: string; tag: string; desc: string };

const CLUB_FOOTBALL_HREF = "/teams/football";
const DOT: Record<string, string> = {
  regular: "#1D9E75",
  playoffs: "#EF9F27",
  worldcup: "#7F77DD",
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
  const color = DOT[tone];
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

export default function SportsConsole({ deepDives }: { deepDives: ConsoleDeepDive[] }) {
  const groups = catalogByFamily(false)
    .map((g) => ({ family: g.family, entries: g.entries.filter((e) => !e.subRoll) }))
    .filter((g) => g.entries.length > 0);
  const liveCount = groups.reduce(
    (n, g) =>
      n +
      g.entries.filter((e) => {
        const s = statusFor(e.href);
        return !!s && s.tone !== "offseason";
      }).length,
    0,
  );

  return (
    <aside id="console" className="space-y-5 lg:sticky lg:top-20 scroll-mt-20" style={{ alignSelf: "start" }}>
      <div className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)", ...mono }}>
            League hubs
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[10px] rounded-full border px-2 py-0.5"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", ...mono }}
          >
            <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: DOT.regular }} aria-hidden="true" />
            {liveCount} live now
          </span>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
          <Legend color={DOT.regular} label="In season" />
          <Legend color={DOT.playoffs} label="Playoffs" />
          <Legend color={DOT.worldcup} label="World Cup" />
          <Legend color={DOT.offseason} label="Offseason" />
        </div>

        <Link
          href="/sports/champions"
          className="flex items-center gap-2 rounded-md border px-2.5 py-2 mb-1 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ borderColor: "rgba(212,175,55,0.4)", background: "rgba(212,175,55,0.08)" }}
        >
          <span aria-hidden className="text-sm leading-none">🏆</span>
          <span className="text-[12px] font-semibold" style={{ color: "#d4af37" }}>Current Champions</span>
          <span aria-hidden className="ml-auto text-[var(--text-dim)]">→</span>
        </Link>

        <div>
          {groups.map((g) => {
            const isSelf = g.entries.length === 1 && boardLabelFor(g.entries[0]) === g.family;
            return (
              <div key={g.family} className="flex items-start gap-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex-none text-[10px] tracking-widest uppercase pt-1.5" style={{ width: 84, color: "var(--text-dim)", ...mono }}>
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
        </div>
      </div>

      <div>
        <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)", ...mono }}>
          Deep-dives
        </div>
        <a
          href="#deep-dives"
          className="group flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <span className="text-sm font-medium group-hover:text-[var(--accent)]" style={{ color: "var(--text)" }}>
            {deepDives.length} cross-sport features
          </span>
          <span className="text-xs text-[var(--text-muted)] transition-transform group-hover:translate-y-0.5" aria-hidden="true">&darr;</span>
        </a>
      </div>

      <div className="flex items-center gap-2 text-[11px]" style={mono}>
        <Link
          href="/methodology"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Methodology &rarr;
        </Link>
        <Link
          href="/updates"
          className="flex-1 text-center rounded-md border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          What&apos;s new &rarr;
        </Link>
      </div>
    </aside>
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
