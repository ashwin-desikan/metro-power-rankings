#!/usr/bin/env python3
"""
Surface Deep Dives: full-width band below the map + pinned featured spotlight,
and slim the sidebar Deep-dives to a pointer. Run from the repo root:

    python scripts/sports-deep-dives-band.py

app/sports/page.tsx:
  - HubNav: "Hubs & deep-dives -> #console" becomes "Deep dives -> #deep-dives";
  - adds DEEP_DIVE_ACCENTS + FEATURED_DEEP_DIVE constants and featured/rest split;
  - inserts a full-width <section id="deep-dives"> below the map and above the
    league directory: a large pinned spotlight card + a 3-up grid of the rest,
    descriptions restored, a distinct accent per piece.
app/sports/SportsConsole.tsx:
  - the sidebar Deep-dives list becomes a single slim pointer to #deep-dives.

Idempotent (per-file guards); backs up touched files to *.v6.bak. Nothing committed.
"""

import os, sys, shutil

PAGE = os.path.join("app", "sports", "page.tsx")
CONSOLE = os.path.join("app", "sports", "SportsConsole.tsx")

PAGE_GUARD = "FEATURED_DEEP_DIVE"
CONSOLE_GUARD = 'cross-sport features'

# --- page.tsx edits ---
NAV_OLD = '          { label: "Hubs & deep-dives", href: "#console" },'
NAV_NEW = '          { label: "Deep dives", href: "#deep-dives" },'

CONST_ANCHOR = '''  {
    href: "/top-teams",
    title: "The Team That Wins the City",
    tag: "Every metro",
    desc: "One crest per metro: the club whose disappearance would change what the metro is, not the one with the most trophies.",
  },
];'''
CONST_NEW = CONST_ANCHOR + '''

// Editorial accent per deep dive (no cover images yet; color + type carry it).
const DEEP_DIVE_ACCENTS: Record<string, string> = {
  "/sports/geography-of-erasure": "#4ECDC4",
  "/sports/games": "#a855f7",
  "/sports/valuations": "#f59e0b",
  "/top-teams": "#D4537E",
};
const DEFAULT_DEEP_DIVE_ACCENT = "#4ECDC4";
// The pinned spotlight piece shown as the large featured card.
const FEATURED_DEEP_DIVE = "/sports/geography-of-erasure";'''

HUBS_ANCHOR = '''  const hubs = composedCards
    .filter((c) => c.status === "live" && c.page)
    .map((c) => ({ label: c.label, sport: c.sport, href: c.page as string }));'''
HUBS_NEW = HUBS_ANCHOR + '''

  const featuredDeepDive = DEEP_DIVES.find((d) => d.href === FEATURED_DEEP_DIVE) ?? DEEP_DIVES[0];
  const restDeepDives = DEEP_DIVES.filter((d) => d.href !== featuredDeepDive.href);'''

BAND_ANCHOR = '      {/* Full league directory: the complete reference grid, below the fold. */}'
BAND_NEW = '''      {/* Deep Dives - editorial features get a full-width band below the map,
          with one pinned spotlight, ahead of the league reference grid. */}
      <section id="deep-dives" className="mb-12 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Deep Dives</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Cross-sport features that cut across leagues.</p>

        <Link
          href={featuredDeepDive.href}
          className="group block rounded-xl border p-6 mb-3 transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            borderLeftWidth: "4px",
            borderLeftColor: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT }}
            >
              {featuredDeepDive.tag}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Featured</span>
          </div>
          <div className="text-2xl font-bold tracking-tight mb-2 group-hover:text-[var(--accent)]">{featuredDeepDive.title}</div>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl">{featuredDeepDive.desc}</p>
          <div
            className="mt-3 text-xs font-semibold"
            style={{ color: DEEP_DIVE_ACCENTS[featuredDeepDive.href] ?? DEFAULT_DEEP_DIVE_ACCENT }}
          >
            Explore &rarr;
          </div>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {restDeepDives.map((d) => {
            const accent = DEEP_DIVE_ACCENTS[d.href] ?? DEFAULT_DEEP_DIVE_ACCENT;
            return (
              <Link
                key={d.href}
                href={d.href}
                className="group block rounded-xl border p-5 transition-colors hover:bg-[var(--bg-card-hover)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: "3px", borderLeftColor: accent }}
              >
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: accent }}>{d.tag}</div>
                <div className="font-semibold text-lg tracking-tight mb-1 group-hover:text-[var(--accent)]">{d.title}</div>
                <p className="text-sm text-[var(--text-muted)]">{d.desc}</p>
                <div className="mt-3 text-xs font-semibold" style={{ color: accent }}>Explore &rarr;</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Full league directory: the complete reference grid, below the fold. */}'''

# --- SportsConsole edit: slim Deep-dives to a pointer ---
SC_OLD = '''      <div>
        <div
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Deep-dives
        </div>
        <ul className="space-y-2">
          {deepDives.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="group block rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div
                    className="text-sm font-medium group-hover:text-[var(--accent)]"
                    style={{ color: "var(--text)" }}
                  >
                    {d.title}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] whitespace-nowrap">
                    {d.tag}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>'''
SC_NEW = '''      <div>
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
      </div>'''


def fail(m): print("ABORTED: " + m); sys.exit(1)

def patch(path, edits, guard, suffix=".v6.bak"):
    if not os.path.isfile(path): fail(path + " not found. Run from the repo root.")
    src = open(path, encoding="utf-8").read()
    if guard in src:
        print("  skip    " + path + " (already applied)"); return
    for label, old, new in edits:
        if old not in src:
            fail("anchor not found in " + path + ": " + label + ". Send me the current file.")
        src = src.replace(old, new, 1)
    shutil.copyfile(path, path + suffix)
    open(path, "w", encoding="utf-8", newline="\n").write(src)
    print("  patched " + path)

def main():
    patch(PAGE, [
        ("HubNav", NAV_OLD, NAV_NEW),
        ("constants", CONST_ANCHOR, CONST_NEW),
        ("featured split", HUBS_ANCHOR, HUBS_NEW),
        ("band section", BAND_ANCHOR, BAND_NEW),
    ], PAGE_GUARD)
    patch(CONSOLE, [("sidebar pointer", SC_OLD, SC_NEW)], CONSOLE_GUARD)
    print()
    print("Done. Run your TS type check, then preview /sports before committing.")

if __name__ == "__main__":
    main()
