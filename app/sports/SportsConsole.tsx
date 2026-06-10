import Link from "next/link";
import { leagueStatusFor, clubFootballStatus, type LeagueStatus } from "@/lib/leagueStatus";
import ClubFootballRow from "./ClubFootballRow";

// Sticky sidebar for /sports, the cross-sport analogue of app/HomeSidebar.
// Lives beside the map at lg+ (col-span-4) and stacks below on mobile.
//   1. League hubs - dense list of every live hub, grouped into "In season"
//      (regular / playoffs / world cup) and "Offseason", each row carrying a
//      color-coded dot + short live-status label from lib/leagueStatus. The
//      Club Football row is expandable (ClubFootballRow) and uses an aggregate
//      status so it sorts into In-season whenever any competition or league is
//      active.
//   2. Deep-dives  - the cross-sport feature pages.
//   3. Methodology / What's new CTAs.
// Server component. Hub data is passed in from page.tsx (no new fetch).

const CLUB_FOOTBALL_HREF = "/teams/football";

export type ConsoleHub = { label: string; sport: string; href: string };
export type ConsoleDeepDive = { href: string; title: string; tag: string; desc: string };

type RankedHub = ConsoleHub & { status: LeagueStatus | null };

const TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};

function shortStatus(s: LeagueStatus): string {
  return s.label.replace(/^Live\s*-\s*/, "");
}

function statusFor(href: string): LeagueStatus | null {
  return href === CLUB_FOOTBALL_HREF ? clubFootballStatus() : leagueStatusFor(href);
}

export default function SportsConsole({
  hubs,
  deepDives,
}: {
  hubs: ConsoleHub[];
  deepDives: ConsoleDeepDive[];
}) {
  // Rendered in the order passed in (matches the Sports nav dropdown).
  // Per-row status colours are preserved; offseason rows are dimmed.
  const ranked: RankedHub[] = hubs.map((h) => ({ ...h, status: statusFor(h.href) }));

  const renderRow = (h: RankedHub, dim: boolean) =>
    h.href === CLUB_FOOTBALL_HREF ? (
      <ClubFootballRow key={h.href} href={h.href} label={h.label} sport={h.sport} dim={dim} />
    ) : (
      <HubRow key={h.href} hub={h} dim={dim} />
    );

  return (
    <aside
      id="console"
      className="space-y-5 lg:sticky lg:top-20 scroll-mt-20"
      style={{ alignSelf: "start" }}
    >
      <div>
        <div
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          League hubs
        </div>
        <div
          className="rounded-lg border overflow-hidden"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {ranked.map((h) => renderRow(h, !h.status || h.status.tone === "offseason"))}
        </div>
      </div>

      <div>
        <div
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
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

      <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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

function HubRow({ hub, dim = false }: { hub: RankedHub; dim?: boolean }) {
  const tone = hub.status?.tone ?? "offseason";
  const color = TONE_COLOR[tone];
  return (
    <Link
      href={hub.href}
      className="flex items-center gap-2 px-2.5 py-1.5 border-t text-[13px] transition-colors hover:bg-[var(--bg-card-hover)]"
      style={{ borderColor: "var(--border)", color: dim ? "var(--text-muted)" : "var(--text)" }}
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 7, height: 7, background: color }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span className="block truncate leading-tight">{hub.label}</span>
        <span className="block truncate leading-tight text-[10px] text-[var(--text-dim)]">{hub.sport}</span>
      </span>
      {hub.status && (
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {shortStatus(hub.status)}
        </span>
      )}
    </Link>
  );
}
