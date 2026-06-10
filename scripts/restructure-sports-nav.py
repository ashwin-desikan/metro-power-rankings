#!/usr/bin/env python3
r"""
Sports nav restructure:
  - Sports dropdown (app/DesktopNav.tsx): replace standalone IPL with an
    expandable "Other Sports" group (IPL, AFL, NRL, CFL), keeping order +
    status-colour dots.
  - Mobile menu (app/MobileMenu.tsx): list IPL, AFL, NRL, CFL inline (flat).
  - /sports League hubs (app/sports/page.tsx + SportsConsole.tsx): render hubs
    flat in the dropdown order, no Other Sports category, status colours kept
    (worldcup purple / playoffs orange / regular green / offseason gray).

Run from repo root:  python scripts/restructure-sports-nav.py
Idempotent; anchor-asserted. Optional argv[1] = repo base dir (for testing).
"""
import os, sys, shutil

BASE = sys.argv[1] if len(sys.argv) > 1 else "."
DESK = os.path.join(BASE, "app", "DesktopNav.tsx")
MOB = os.path.join(BASE, "app", "MobileMenu.tsx")
PAGE = os.path.join(BASE, "app", "sports", "page.tsx")
CONSOLE = os.path.join(BASE, "app", "sports", "SportsConsole.tsx")

DESK_GROUP = r'''const OTHER_SPORTS = [
  { href: "/teams/ipl", name: "IPL", sport: "Cricket" },
  { href: "/teams/afl", name: "AFL", sport: "Aussie Rules" },
  { href: "/teams/nrl", name: "NRL", sport: "Rugby League" },
  { href: "/teams/cfl", name: "CFL", sport: "Canadian Football" },
];

function otherSportsAggregate(): { color: string; label: string } {
  const live = OTHER_SPORTS.map((s) => leagueStatusFor(s.href)).filter(
    (s): s is LeagueStatus => !!s && s.tone !== "offseason",
  );
  if (live.length === 0) return { color: NAV_TONE_COLOR.offseason, label: "Offseason" };
  const order = ["worldcup", "playoffs", "regular"];
  const tone = order.find((t) => live.some((s) => s.tone === t)) ?? "regular";
  return { color: NAV_TONE_COLOR[tone], label: live.length + " live" };
}

// Expandable "Other Sports" row inside the Sports dropdown. Click to reveal the
// minor league hubs. stopPropagation keeps the parent dropdown from closing.
function SportsNavGroup() {
  const [open, setOpen] = useState(false);
  const agg = otherSportsAggregate();
  return (
    <div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-expanded={open}
        className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
      >
        <span className="inline-block rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: agg.color }} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm leading-tight">Other Sports</span>
          <span className="block text-[11px] leading-tight" style={{ color: "var(--text-dim)" }}>IPL &middot; AFL &middot; NRL &middot; CFL</span>
        </span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div>
          {OTHER_SPORTS.map((s) => (
            <div key={s.href} className="pl-3">
              <SportsNavItem href={s.href} name={s.name} sport={s.sport} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DesktopNav({ updated }: { updated: string | null }) {'''

DESK_EDITS = [
    ('export default function DesktopNav({ updated }: { updated: string | null }) {', DESK_GROUP),
    ('        <SportsNavItem href="/teams/ipl" name="IPL" sport="Cricket" />',
     '        <SportsNavGroup />'),
]

MOB_EDITS = [
    (
        "  { href: '/teams/ipl', label: 'IPL', hint: 'All 10 IPL franchises, season standings, playoffs, and finals history since 2008', group: 'Sports' },",
        "  { href: '/teams/ipl', label: 'IPL', hint: 'All 10 IPL franchises, season standings, playoffs, and finals history since 2008', group: 'Sports' },\n"
        "  { href: '/teams/afl', label: 'AFL', hint: 'Every VFL/AFL club since 1897, premierships, ladders, and the full Grand Final roll', group: 'Sports' },\n"
        "  { href: '/teams/nrl', label: 'NRL', hint: 'Every NSWRL/NRL club since 1908, premierships, ladders, and the full Grand Final roll', group: 'Sports' },\n"
        "  { href: '/teams/cfl', label: 'CFL', hint: 'Every CFL franchise, live standings, season records, and Grey Cup history since 1909', group: 'Sports' },",
    ),
]

PAGE_EDITS = [
    (
        '  // Sidebar hub links: every live league card that resolves to a real page.\n'
        '  const hubs = composedCards\n'
        '    .filter((c) => c.status === "live" && c.page)\n'
        '    .map((c) => ({ label: c.label, sport: c.sport, href: c.page as string }));',
        '  // Sidebar hub links, ordered to match the Sports nav dropdown.\n'
        '  const HUB_ORDER = [\n'
        '    "/teams/football", "/teams/national", "/teams/nfl", "/teams/cfb", "/teams/mlb",\n'
        '    "/teams/nba", "/teams/nhl", "/teams/ipl", "/teams/afl", "/teams/nrl", "/teams/cfl",\n'
        '    "/teams/wfootball", "/teams/wnba",\n'
        '  ];\n'
        '  const liveHubByPage = new Map(\n'
        '    composedCards.filter((c) => c.status === "live" && c.page).map((c) => [c.page as string, c]),\n'
        '  );\n'
        '  const orderedHubCards = HUB_ORDER.map((p) => liveHubByPage.get(p)).filter((c): c is LeagueCard => !!c);\n'
        '  const hubs = [\n'
        '    ...orderedHubCards,\n'
        '    ...Array.from(liveHubByPage.values()).filter((c) => !HUB_ORDER.includes(c.page as string)),\n'
        '  ].map((c) => ({ label: c.label, sport: c.sport, href: c.page as string }));',
    ),
]

CONSOLE_EDITS = [
    ('const TONE_RANK: Record<string, number> = { worldcup: 0, playoffs: 1, regular: 2, offseason: 3 };\n', ''),
    (
        '  const ranked: RankedHub[] = hubs.map((h) => ({ ...h, status: statusFor(h.href) }));\n'
        '  const inSeason = ranked\n'
        '    .filter((h) => h.status && h.status.tone !== "offseason")\n'
        '    .sort((a, b) => TONE_RANK[a.status!.tone] - TONE_RANK[b.status!.tone] || a.label.localeCompare(b.label));\n'
        '  const offseason = ranked\n'
        '    .filter((h) => !h.status || h.status.tone === "offseason")\n'
        '    .sort((a, b) => a.label.localeCompare(b.label));',
        '  // Rendered in the order passed in (matches the Sports nav dropdown).\n'
        '  // Per-row status colours are preserved; offseason rows are dimmed.\n'
        '  const ranked: RankedHub[] = hubs.map((h) => ({ ...h, status: statusFor(h.href) }));',
    ),
    (
        '          <GroupLabel>In season &middot; {inSeason.length}</GroupLabel>\n'
        '          {inSeason.map((h) => renderRow(h, false))}\n'
        '          {offseason.length > 0 && <GroupLabel>Offseason &middot; {offseason.length}</GroupLabel>}\n'
        '          {offseason.map((h) => renderRow(h, true))}',
        '          {ranked.map((h) => renderRow(h, !h.status || h.status.tone === "offseason"))}',
    ),
    (
        'function GroupLabel({ children }: { children: React.ReactNode }) {\n'
        '  return (\n'
        '    <div\n'
        '      className="px-2.5 py-1.5 text-[9px] tracking-widest uppercase border-t first:border-t-0"\n'
        '      style={{ background: "var(--bg)", color: "var(--text-dim)", borderColor: "var(--border)", fontFamily: "\'JetBrains Mono\', monospace" }}\n'
        '    >\n'
        '      {children}\n'
        '    </div>\n'
        '  );\n'
        '}\n\n',
        '',
    ),
]

def patch(path, edits, marker):
    if not os.path.isfile(path):
        print("ABORTED: missing " + path); raise SystemExit(1)
    s = open(path, encoding="utf-8").read()
    if marker in s:
        print("Already patched: " + path); return
    for i, (old, new) in enumerate(edits, 1):
        n = s.count(old)
        if n != 1:
            print("ABORTED %s edit %d: anchor matched %d times (expected 1):\n%s" % (path, i, n, old[:120])); raise SystemExit(1)
        s = s.replace(old, new, 1)
    shutil.copyfile(path, path + ".sportsnav.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + path)

def main():
    patch(DESK, DESK_EDITS, "function SportsNavGroup()")
    patch(MOB, MOB_EDITS, "/teams/afl")
    patch(PAGE, PAGE_EDITS, "HUB_ORDER")
    patch(CONSOLE, CONSOLE_EDITS, "matches the Sports nav dropdown")

if __name__ == "__main__":
    main()
