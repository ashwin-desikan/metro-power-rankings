#!/usr/bin/env python3
"""
Sports console + nav refinements. Run from the repo root:

    python scripts/sports-console-refinements.py

1. app/sports/ClubFootballRow.tsx: parent row now LINKS to the Club Football
   hub (/teams/football) with a separate caret button that toggles the
   expander; shows the sport under the label.
2. app/sports/SportsConsole.tsx: League-hub rows show the sport under the
   league name; passes sport to ClubFootballRow.
3. app/DesktopNav.tsx: the Sports menu dropdown is rebuilt to the league-hub
   format (status dot + name + sport + short status), dropping the verbose
   hint lines.

Idempotent (per-file guards); backs up touched files to *.v5.bak. Nothing committed.
"""

import os, sys, shutil

CLUBROW = os.path.join("app", "sports", "ClubFootballRow.tsx")
CONSOLE = os.path.join("app", "sports", "SportsConsole.tsx")
NAV = os.path.join("app", "DesktopNav.tsx")

# ---- ClubFootballRow: props + parent row (link + caret) ----
CR_PROPS_OLD = '''export default function ClubFootballRow({
  href,
  label,
  dim = false,
}: {
  href: string;
  label: string;
  dim?: boolean;
}) {'''
CR_PROPS_NEW = '''export default function ClubFootballRow({
  href,
  label,
  sport,
  dim = false,
}: {
  href: string;
  label: string;
  sport: string;
  dim?: boolean;
}) {'''

CR_BTN_OLD = '''      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-card-hover)]"
        style={{ color: dim ? "var(--text-muted)" : "var(--text)" }}
      >
        <span
          className="inline-block rounded-full flex-shrink-0"
          style={{ width: 7, height: 7, background: color }}
          aria-hidden="true"
        />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {status.label}
        </span>
        <span
          className="text-[var(--text-dim)] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none", fontSize: "10px" }}
          aria-hidden="true"
        >
          &#9656;
        </span>
      </button>'''
CR_BTN_NEW = '''      <div className="flex items-stretch">
        <Link
          href={href}
          className="flex items-center gap-2 pl-2.5 py-1.5 text-[13px] flex-1 min-w-0 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ color: dim ? "var(--text-muted)" : "var(--text)" }}
        >
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 7, height: 7, background: color }}
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0">
            <span className="block truncate leading-tight">{label}</span>
            <span className="block truncate leading-tight text-[10px] text-[var(--text-dim)]">{sport}</span>
          </span>
          <span className="text-[10px] whitespace-nowrap" style={{ color }}>
            {status.label}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show Club Football competitions and leagues"
          className="px-2.5 flex items-center border-l transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          <span
            className="transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "none", fontSize: "10px" }}
            aria-hidden="true"
          >
            &#9656;
          </span>
        </button>
      </div>'''

# ---- SportsConsole: sport under league + pass sport to ClubFootballRow ----
SC_HUBROW_OLD = '      <span className="flex-1 truncate">{hub.label}</span>'
SC_HUBROW_NEW = '''      <span className="flex-1 min-w-0">
        <span className="block truncate leading-tight">{hub.label}</span>
        <span className="block truncate leading-tight text-[10px] text-[var(--text-dim)]">{hub.sport}</span>
      </span>'''

SC_PASS_OLD = '<ClubFootballRow key={h.href} href={h.href} label={h.label} dim={dim} />'
SC_PASS_NEW = '<ClubFootballRow key={h.href} href={h.href} label={h.label} sport={h.sport} dim={dim} />'

# ---- DesktopNav: import + SportsNavItem helper + dropdown rebuild ----
NAV_IMPORT_OLD = 'import { leagueStatusFor, LeagueStatusTag } from "@/lib/leagueStatus";'
NAV_IMPORT_NEW = 'import { leagueStatusFor, clubFootballStatus, LeagueStatusTag, type LeagueStatus } from "@/lib/leagueStatus";'

NAV_HELPER_ANCHOR = '''    </a>
  );
}'''
NAV_HELPER_NEW = '''    </a>
  );
}

const NAV_TONE_COLOR: Record<string, string> = {
  regular: "#10b981",
  playoffs: "#f59e0b",
  worldcup: "#a855f7",
  offseason: "#55556A",
};

function navShortStatus(label: string): string {
  return label.replace(/^Live\\s*-\\s*/, "");
}

// Compact Sports-menu item: a status dot + name + sport + short live-status,
// mirroring the /sports League hubs list. Replaces the wordy hint lines.
function SportsNavItem({ href, name, sport }: { href: string; name: string; sport: string }) {
  const status: LeagueStatus | null =
    href === "/teams/football" ? clubFootballStatus() : leagueStatusFor(href);
  const tone = status?.tone ?? "offseason";
  const color = NAV_TONE_COLOR[tone];
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 7, height: 7, background: color }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm leading-tight">{name}</span>
        <span className="block text-[11px] leading-tight" style={{ color: "var(--text-dim)" }}>{sport}</span>
      </span>
      {status && (
        <span className="text-[10px] whitespace-nowrap" style={{ color }}>
          {navShortStatus(status.label)}
        </span>
      )}
    </a>
  );
}'''

NAV_DROPDOWN_OLD = '''      <Dropdown id="sports" label="Sports" openId={openId} setOpenId={setOpenId}>
        <DropdownItem href="/sports" title="All sports" hint="Every top-flight team on one map." />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/teams/football" title="Club Football" hint="European top flights plus the English pyramid." />
        <DropdownItem href="/teams/national" title="International Football" hint="National teams and tournament hubs." />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/teams/nfl" title="NFL" hint="32 franchises, sortable." />
        <DropdownItem href="/teams/mlb" title="MLB" hint="30 franchises, sortable." />
        <DropdownItem href="/teams/nba" title="NBA" hint="30 franchises; live 2026 playoffs." />
        <DropdownItem href="/teams/nhl" title="NHL" hint="32 franchises; Stanley Cups since 1910." />
        <DropdownItem href="/teams/ipl" title="IPL" hint="10 franchises; all IPL seasons since 2008." />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <DropdownItem href="/teams/wfootball" title="Women's Football" hint="Honors history: UWCL, WSL, Liga F, NWSL and more." />
        <DropdownItem href="/teams/wnba" title="WNBA" hint="Current and defunct franchises; champions since 1997." />
      </Dropdown>'''
NAV_DROPDOWN_NEW = '''      <Dropdown id="sports" label="Sports" openId={openId} setOpenId={setOpenId}>
        <a
          href="/sports"
          className="block px-4 py-2.5 text-sm font-medium hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)] transition-colors"
        >
          All sports <span aria-hidden className="text-[var(--text-dim)]">→</span>
        </a>
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/football" name="Club Football" sport="Football" />
        <SportsNavItem href="/teams/national" name="International Football" sport="Football" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/nfl" name="NFL" sport="American Football" />
        <SportsNavItem href="/teams/mlb" name="MLB" sport="Baseball" />
        <SportsNavItem href="/teams/nba" name="NBA" sport="Basketball" />
        <SportsNavItem href="/teams/nhl" name="NHL" sport="Ice Hockey" />
        <SportsNavItem href="/teams/ipl" name="IPL" sport="Cricket" />
        <div className="border-t" style={{ borderColor: "var(--border)" }} />
        <SportsNavItem href="/teams/wfootball" name="Women's Football" sport="Football" />
        <SportsNavItem href="/teams/wnba" name="WNBA" sport="Basketball" />
      </Dropdown>'''


def fail(m): print("ABORTED: " + m); sys.exit(1)

def patch(path, edits, guard_substr, backup_suffix=".v5.bak"):
    if not os.path.isfile(path): fail(path + " not found. Run from the repo root.")
    src = open(path, encoding="utf-8").read()
    if guard_substr in src:
        print("  skip    " + path + " (already applied)"); return
    for label, old, new in edits:
        if old not in src:
            fail("anchor not found in " + path + ": " + label + ". Send me the current file.")
        src = src.replace(old, new, 1)
    shutil.copyfile(path, path + backup_suffix)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    print("  patched " + path)

def main():
    patch(CLUBROW, [
        ("props", CR_PROPS_OLD, CR_PROPS_NEW),
        ("parent row", CR_BTN_OLD, CR_BTN_NEW),
    ], guard_substr='aria-label="Show Club Football competitions and leagues"')
    patch(CONSOLE, [
        ("HubRow sport", SC_HUBROW_OLD, SC_HUBROW_NEW),
        ("pass sport", SC_PASS_OLD, SC_PASS_NEW),
    ], guard_substr='sport={h.sport}')
    patch(NAV, [
        ("import", NAV_IMPORT_OLD, NAV_IMPORT_NEW),
        ("helper", NAV_HELPER_ANCHOR, NAV_HELPER_NEW),
        ("dropdown", NAV_DROPDOWN_OLD, NAV_DROPDOWN_NEW),
    ], guard_substr="SportsNavItem")
    print()
    print("Done. Run your TS type check, then preview /sports and the Sports menu before committing.")

if __name__ == "__main__":
    main()
