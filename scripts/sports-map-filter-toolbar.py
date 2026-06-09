#!/usr/bin/env python3
"""
/sports map: compact control toolbar above the map + Country (and the other
long facets) as searchable dropdown popovers.

Run from the repo root:

    python scripts/sports-map-filter-toolbar.py

What it does to app/sports/SportsExplorer.tsx:
  - imports the new FilterDropdown component;
  - gives FilterRow optional `searchable` + `hideLabel` props (search input that
    filters facets; label hidden when shown inside a dropdown);
  - rewrites the component's return so the order is: search -> Preset (chips) ->
    Sport (chips) -> football callout -> Special Filters -> a "Refine" row of
    dropdown buttons (League, Country, Federation, FIFA, Active, Level) ->
    MAP -> tier definitions. The map now sits right under the controls, and the
    long Country list lives in a scrollable, searchable popover instead of a
    chip cloud below the map. Country is no longer capped at 30.
  - creates app/sports/FilterDropdown.tsx (button + popover, click-outside +
    Escape to close).

Safety: idempotent (skips if FilterDropdown already imported); anchors asserted;
backs up SportsExplorer.tsx to *.v4.bak. page.tsx untouched. Nothing committed.
"""

import os
import sys
import shutil

EXPLORER = os.path.join("app", "sports", "SportsExplorer.tsx")
DROPDOWN = os.path.join("app", "sports", "FilterDropdown.tsx")

DROPDOWN_TSX = r'''"use client";

import { useEffect, useRef, useState } from "react";

// FilterDropdown — a labelled button that opens a popover panel below it.
// Used in the /sports map toolbar to hold the long facet rows (Country,
// League, etc.) so the controls stay compact and the map stays in view.
// Closes on outside click or Escape. The panel scrolls when tall.

export default function FilterDropdown({
  label,
  count = 0,
  widthClass = "w-72",
  children,
}: {
  label: string;
  count?: number;
  widthClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = count > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)]"
        style={{
          borderColor: active ? "var(--accent)" : "var(--border)",
          color: active ? "var(--accent)" : "var(--text)",
          background: "var(--bg-card)",
        }}
      >
        <span>{label}</span>
        {active && (
          <span
            className="rounded-full px-1.5 text-[9px] tabular-nums"
            style={{ background: "var(--accent-dim)", color: "var(--text)" }}
          >
            {count}
          </span>
        )}
        <span
          aria-hidden
          className="text-[var(--text-dim)] transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none", fontSize: "9px" }}
        >
          ▼
        </span>
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full mt-1 ${widthClass} rounded-lg border shadow-xl p-3 max-h-80 overflow-y-auto`}
          style={{ zIndex: 1000, background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
'''

# ---- SportsExplorer edits ----

IMPORT_ANCHOR = 'import { useRouter, useSearchParams, usePathname } from "next/navigation";'
IMPORT_NEW = IMPORT_ANCHOR + '\nimport FilterDropdown from "./FilterDropdown";'

FR_DESTR_ANCHOR = "  renderMajor,\n}: {"
FR_DESTR_NEW = "  renderMajor,\n  searchable,\n  hideLabel,\n}: {"

FR_TYPE_ANCHOR = "  renderMajor?: (name: string) => boolean;\n}) {"
FR_TYPE_NEW = "  renderMajor?: (name: string) => boolean;\n  searchable?: boolean;\n  hideLabel?: boolean;\n}) {"

FR_HOOK_ANCHOR = "}) {\n  if (facets.length === 0) return null;\n  const hasSelection = active.size > 0;\n  return ("
FR_HOOK_NEW = (
    "}) {\n"
    "  const [q, setQ] = useState(\"\");\n"
    "  if (facets.length === 0) return null;\n"
    "  const hasSelection = active.size > 0;\n"
    "  const shown =\n"
    "    searchable && q.trim()\n"
    "      ? facets.filter(([n]) => n.toLowerCase().includes(q.trim().toLowerCase()))\n"
    "      : facets;\n"
    "  return ("
)

FR_LABEL_ANCHOR = (
    '      <div className="flex items-baseline gap-2 mb-1.5">\n'
    '        <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">{label}</span>'
)
FR_LABEL_NEW = (
    '      <div className="flex items-baseline gap-2 mb-1.5">\n'
    '        {!hideLabel && (\n'
    '          <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">{label}</span>\n'
    '        )}'
)

FR_CHIPS_ANCHOR = '      <div className="flex flex-wrap gap-1.5">\n        {facets.map(([name, count]) => {'
FR_CHIPS_NEW = (
    '      {searchable && (\n'
    '        <input\n'
    '          type="search"\n'
    '          value={q}\n'
    '          onChange={(e) => setQ(e.target.value)}\n'
    '          placeholder={`Filter ${label.toLowerCase()}…`}\n'
    '          className="w-full mb-2 px-2 py-1.5 rounded-md border bg-transparent text-[12px] focus:outline-none focus:border-[var(--accent)]"\n'
    '          style={{ borderColor: "var(--border)" }}\n'
    '          aria-label={`Filter ${label.toLowerCase()}`}\n'
    '        />\n'
    '      )}\n'
    '      <div className="flex flex-wrap gap-1.5">\n'
    '        {shown.map(([name, count]) => {'
)

RET_START = '  return (\n    <section className="space-y-3">'
RET_END = (
    '      {levelFacets.length >= 2 && (\n'
    '        <FilterRow\n'
    '          label="Level"\n'
    '          facets={levelFacets}\n'
    '          active={filters.levels}\n'
    '          onToggle={(v) => toggle("levels", v)}\n'
    '          onClearGroup={() => clearGroup("levels")}\n'
    '          litWhenUnselected={levelRowLit}\n'
    '        />\n'
    '      )}\n'
    '    </section>\n'
    '  );\n'
    '}'
)

NEW_RETURN = r'''  return (
    <section className="space-y-3">
      {/* Search + result count */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search team or metro…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-transparent text-sm focus:outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Search teams"
          />
          {searchMatches.length > 0 && query.trim().length >= 2 && (
            <div
              className="absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-xl overflow-hidden"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {searchMatches.map((m, i) => {
                const inner = (
                  <div className="px-3 py-2 hover:bg-[var(--bg-card-hover)] flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.team}</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {m.league} · {m.metro || m.city || m.country}
                      </div>
                    </div>
                    {m.team_page_url ? (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--accent)]">Open</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">No page</span>
                    )}
                  </div>
                );
                return m.team_page_url ? (
                  <Link key={i} href={m.team_page_url}>{inner}</Link>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">
          Showing <strong className="text-[var(--text)]">{visible.length.toLocaleString()}</strong> of {teams.length.toLocaleString()}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-3 underline decoration-dotted hover:text-[var(--accent)]"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Preset row — mutually exclusive. */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Preset</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <PresetChip
            label="Gold Standard"
            count={goldStandardCount}
            active={preset === "gold"}
            onClick={() => handlePresetChange("gold")}
            crown
            title="The world's top-flight competition in each sport: NBA, NFL, NHL, MLB, CFL, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Top 14, WSL, NWSL, Superlega, NRL, AFL, Handball-Bundesliga, WNBA, IPL."
          />
          <PresetChip
            label="Major League"
            count={majorCount}
            active={preset === "major"}
            onClick={() => handlePresetChange("major")}
            silver
            title="Every workbook Major League top-flight team across all sports. Includes the Gold Standard as a strict subset."
          />
          <PresetChip
            label="Other Teams"
            count={otherCount}
            active={preset === "other"}
            onClick={() => handlePresetChange("other")}
            title="Every other team: college (FBS, NCAA D-I, FCS, College Hockey, NCAA W), Minor League, Junior, lower-flight football, second-tier international leagues."
          />
          <PresetChip
            label="All Teams"
            count={allCount}
            active={preset === "all"}
            onClick={() => handlePresetChange("all")}
            title="Everything on file: Major League + Other combined."
          />
        </div>
      </div>

      {/* Sport filter — primary discriminator, kept as inline chips. */}
      <FilterRow
        label="Sport"
        facets={sportFacets}
        active={filters.sports}
        onToggle={(v) => toggle("sports", v)}
        onClearGroup={() => clearGroup("sports")}
        litWhenUnselected={sportRowLit}
        renderDot={(name) => SPORT_COLORS[name] || DEFAULT_SPORT_COLOR}
      />

      {/* Football league hub callout. */}
      {filters.sports.has("Football") && (
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-1.5">
            Football league hubs
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { slug: "premier-league", label: "Premier League" },
              { slug: "la-liga",        label: "La Liga" },
              { slug: "serie-a",        label: "Serie A" },
              { slug: "bundesliga",     label: "Bundesliga" },
              { slug: "ligue-1",        label: "Ligue 1" },
            ].map((h) => (
              <Link
                key={h.slug}
                href={`/teams/football/leagues/${h.slug}`}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
                title={`Open the ${h.label} hub: current standings, all-time champions, most decorated`}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ background: SPORT_COLORS["Football"], width: 8, height: 8 }}
                  aria-hidden
                />
                {h.label}
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Special Filters — sport-conditional opt-in additives. */}
      {(showPowerSpecial || showInternationalSpecial) && (
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mb-1.5">Special Filters</div>
          <div className="flex flex-wrap gap-1.5">
            {showPowerSpecial && (
              <SpecialChip
                label="+ NCAA Power Conferences"
                count={powerCount}
                active={addPower}
                onClick={toggleAddPower}
                title={addPower
                  ? "On: Big Ten / SEC / Big 12 / ACC football and Big East-inclusive Big 5 basketball are layered on top of the preset. Click to remove."
                  : "Off: click to layer NCAA Power Conferences (Big Ten / SEC / Big 12 / ACC football + Big East-inclusive Big 5 basketball) on top of the preset."}
              />
            )}
            {showInternationalSpecial && (
              <SpecialChip
                label="+ International Teams"
                count={internationalCount}
                active={addInternational}
                onClick={toggleAddInternational}
                title={addInternational
                  ? "On: the 250 national football teams are layered on top of the preset, with the Federation sub-filter below. Click to remove."
                  : "Off: click to layer the 250 national football teams on top of the preset."}
              />
            )}
          </div>
        </div>
      )}

      {/* Refine — long facets collapse into dropdown popovers so the map below
          stays visible. Country is uncapped and searchable. */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)] mr-1">Refine</span>
        {(filters.sports.size > 0 || filters.countries.size > 0) && leagueFacets.length > 0 && !addInternational && (
          <FilterDropdown label="League" count={filters.leagues.size}>
            <FilterRow
              label="League"
              facets={leagueFacets}
              active={filters.leagues}
              onToggle={(v) => toggle("leagues", v)}
              onClearGroup={() => clearGroup("leagues")}
              litWhenUnselected={leagueRowLit}
              renderCrown={(name) => goldStandardLeagueFlags.has(name)}
              renderMajor={(name) => majorLeagueFlags.has(name)}
              searchable
              hideLabel
            />
          </FilterDropdown>
        )}
        <FilterDropdown label="Country" count={filters.countries.size}>
          <FilterRow
            label="Country"
            facets={countryFacets}
            active={filters.countries}
            onToggle={(v) => toggle("countries", v)}
            onClearGroup={() => clearGroup("countries")}
            litWhenUnselected={countryRowLit}
            searchable
            hideLabel
          />
        </FilterDropdown>
        {addInternational && federationFacets.length > 0 && (
          <FilterDropdown label="Federation" count={filters.federations.size}>
            <FilterRow
              label="Federation"
              facets={federationFacets}
              active={filters.federations}
              onToggle={(v) => toggle("federations", v)}
              onClearGroup={() => clearGroup("federations")}
              litWhenUnselected={federationRowLit}
              hideLabel
            />
          </FilterDropdown>
        )}
        {addInternational && fifaFacets.length > 0 && (
          <FilterDropdown label="FIFA" count={filters.fifa.size}>
            <FilterRow
              label="FIFA"
              facets={fifaFacets}
              active={filters.fifa}
              onToggle={(v) => toggle("fifa", v)}
              onClearGroup={() => clearGroup("fifa")}
              litWhenUnselected={federationRowLit}
              hideLabel
            />
          </FilterDropdown>
        )}
        {addInternational && activeFacets.length > 0 && (
          <FilterDropdown label="Active" count={filters.active.size}>
            <FilterRow
              label="Active"
              facets={activeFacets}
              active={filters.active}
              onToggle={(v) => toggle("active", v)}
              onClearGroup={() => clearGroup("active")}
              litWhenUnselected={federationRowLit}
              hideLabel
            />
          </FilterDropdown>
        )}
        {levelFacets.length >= 2 && (
          <FilterDropdown label="Level" count={filters.levels.size}>
            <FilterRow
              label="Level"
              facets={levelFacets}
              active={filters.levels}
              onToggle={(v) => toggle("levels", v)}
              onClearGroup={() => clearGroup("levels")}
              litWhenUnselected={levelRowLit}
              hideLabel
            />
          </FilterDropdown>
        )}
      </div>

      {/* Map. Mobile gets a viewport-height ceiling so the toolbar stays on
          screen; tablets and up keep the original fixed 540px. */}
      <div className="rounded-lg overflow-hidden border h-[60vh] sm:h-[540px]">
        {visible.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm text-[var(--text)] mb-2">
                No teams match these filters.
              </p>
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="text-xs underline decoration-dotted text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <SportsMapInner markers={visible} />
        )}
      </div>

      {/* Tier definitions — expandable native disclosure. */}
      <details className="group rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-2">
          <span className="text-[10px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
          What do these tiers mean?
        </summary>
        <div className="grid sm:grid-cols-3 gap-4 px-4 pb-4 pt-1 text-[12px] leading-relaxed">
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              <span aria-hidden>🥇</span> Gold Standard{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({goldStandardCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              The apex top-flight in each sport. Football's top-five European leagues (Premier League / La Liga / Serie A / Bundesliga / Ligue 1) plus WSL and NWSL on the women's side. NFL, MLB, NBA, NHL, Top 14, Superlega, NRL, AFL, Handball-Bundesliga, WNBA, IPL elsewhere. The leagues a global sports fan names first.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              <span aria-hidden>🥈</span> Major League{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({majorCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Every workbook-flagged Major League team. Includes the Gold Standard as a strict subset plus other top flights: KHL hockey, CBA basketball, EuroLeague, NPB baseball, CFL, Brasileirão, Argentine Primera, Liga F, and country-level top-flight football outside the European top five.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[var(--text)] mb-1">
              Other Teams{" "}
              <span className="text-[var(--text-dim)] font-normal tabular-nums">({otherCount.toLocaleString()})</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Everything else with a place on the map: US college (FBS, NCAA Division I, NCAA W, FCS, College Hockey), Minor League Baseball, junior hockey, lower-flight football across every footballing nation, second-tier international competitions. Plus 250 national football teams via the Special Filter when Sport=Football is selected.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}'''


def fail(msg):
    print("ABORTED: " + msg)
    sys.exit(1)


def main():
    if not os.path.isfile(EXPLORER):
        fail(EXPLORER + " not found. Run from the repo root.")
    with open(EXPLORER, "r", encoding="utf-8") as f:
        src = f.read()

    if "FilterDropdown" in src:
        print("  skip    " + EXPLORER + " (FilterDropdown already wired)")
    else:
        for name, a in [("import", IMPORT_ANCHOR), ("FilterRow destructure", FR_DESTR_ANCHOR),
                        ("FilterRow type", FR_TYPE_ANCHOR), ("FilterRow hook", FR_HOOK_ANCHOR),
                        ("FilterRow label", FR_LABEL_ANCHOR), ("FilterRow chips", FR_CHIPS_ANCHOR),
                        ("return start", RET_START), ("return end", RET_END)]:
            if a not in src:
                fail("anchor not found: " + name + ". Working copy drifted; send me the current SportsExplorer.tsx.")
        shutil.copyfile(EXPLORER, EXPLORER + ".v4.bak")
        src = src.replace(IMPORT_ANCHOR, IMPORT_NEW, 1)
        src = src.replace(FR_DESTR_ANCHOR, FR_DESTR_NEW, 1)
        src = src.replace(FR_TYPE_ANCHOR, FR_TYPE_NEW, 1)
        src = src.replace(FR_HOOK_ANCHOR, FR_HOOK_NEW, 1)
        src = src.replace(FR_LABEL_ANCHOR, FR_LABEL_NEW, 1)
        src = src.replace(FR_CHIPS_ANCHOR, FR_CHIPS_NEW, 1)
        i = src.index(RET_START)
        j = src.index(RET_END, i) + len(RET_END)
        src = src[:i] + NEW_RETURN + src[j:]
        with open(EXPLORER, "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
        print("  patched " + EXPLORER + " (toolbar above map + dropdown facets)")

    if os.path.isfile(DROPDOWN) and open(DROPDOWN, encoding="utf-8").read() == DROPDOWN_TSX:
        print("  skip    " + DROPDOWN + " (unchanged)")
    else:
        if os.path.isfile(DROPDOWN):
            shutil.copyfile(DROPDOWN, DROPDOWN + ".v4.bak")
        with open(DROPDOWN, "w", encoding="utf-8", newline="\n") as f:
            f.write(DROPDOWN_TSX)
        print("  wrote   " + DROPDOWN)

    print()
    print("Done. Run your TS type check, then preview /sports before committing.")


if __name__ == "__main__":
    main()
