import { describe, it, expect } from "vitest";
import { applySeasonOverlay, type Season, type SeasonOverlay } from "./mlb";

// scripts/ingest/mlb_season_finalize.py writes public/data/mlb/season-overlay.json
// so the 2026 season shows up on team pages before Ashwin fills in MLB.xlsx by
// hand. These cases guard the merge rule in lib/mlb.ts: only the untouched
// workbook placeholder (w+l === 0, same season) gets replaced; anything Ashwin
// has already entered is left alone, and a missing overlay is a no-op.

function placeholderRow(year: number): Season {
  return {
    year,
    league: "MLB",
    city: "Los Angeles",
    team: "Angels",
    w: 0, l: 0, t: 0, win_pct: 0,
    rs: 0, ra: 0, run_diff: 0,
    division: "AL West", main_div: "AL", place: "",
    playoff: false,
    div_title: false,
    best_rec_leag: false,
    lcs_app: false,
    ws_app: false,
    champ: false,
    champ_app: false,
    oth_chmp_app: false,
    oth_chmp: false,
    conf_final: false,
  };
}

function filledRow(year: number): Season {
  return {
    ...placeholderRow(year),
    w: 90, l: 72, win_pct: 0.5556,
    rs: 800, ra: 700, run_diff: 100,
    place: "1", div_title: true,
  };
}

function overlay(opts: Partial<SeasonOverlay["meta"]> = {}): SeasonOverlay {
  return {
    meta: {
      season: 2026,
      generated_at: "2026-09-26T00:00:00Z",
      regular_season_complete: true,
      postseason_complete: false,
      source: "ESPN standings + playoffs.json",
      ...opts,
    },
    teams: {
      Angels: {
        w: 85, l: 77, t: 0, win_pct: 0.5247,
        rs: 750, ra: 720, run_diff: 30,
        place: "3", div_title: false, best_rec_leag: false,
        playoff: false, lcs_app: false, ws_app: false, champ_app: false, champ: false,
      },
    },
  };
}

describe("applySeasonOverlay", () => {
  it("replaces the untouched placeholder row for the overlay's season", () => {
    const rows = [placeholderRow(2025), placeholderRow(2026)];
    const merged = applySeasonOverlay(rows, overlay(), "Angels");

    expect(merged[0]).toEqual(rows[0]); // earlier season untouched
    expect(merged[1].w).toBe(85);
    expect(merged[1].l).toBe(77);
    expect(merged[1].rs).toBe(750);
    expect(merged[1].place).toBe("3");
  });

  it("leaves a row alone once Ashwin has filled it in the workbook", () => {
    const rows = [filledRow(2026)];
    const merged = applySeasonOverlay(rows, overlay(), "Angels");

    expect(merged[0]).toEqual(rows[0]);
    expect(merged[0].w).toBe(90); // not the overlay's 85
  });

  it("is a no-op with no overlay (missing season-overlay.json)", () => {
    const rows = [placeholderRow(2026)];
    const merged = applySeasonOverlay(rows, null, "Angels");

    expect(merged).toEqual(rows);
  });

  it("is a no-op for a team the overlay has no entry for", () => {
    const rows = [placeholderRow(2026)];
    const merged = applySeasonOverlay(rows, overlay(), "Dodgers");

    expect(merged).toEqual(rows);
  });

  it("withholds place and postseason flags while the regular season is incomplete, but keeps w/l/rs/ra true to date", () => {
    const rows = [placeholderRow(2026)];
    const incomplete = overlay({ regular_season_complete: false });
    incomplete.teams.Angels.place = "";
    incomplete.teams.Angels.div_title = false;
    incomplete.teams.Angels.best_rec_leag = false;
    incomplete.teams.Angels.playoff = false;

    const merged = applySeasonOverlay(rows, incomplete, "Angels");

    expect(merged[0].w).toBe(85);
    expect(merged[0].rs).toBe(750);
    expect(merged[0].place).toBe("");
    expect(merged[0].div_title).toBe(false);
    expect(merged[0].best_rec_leag).toBe(false);
  });
});
