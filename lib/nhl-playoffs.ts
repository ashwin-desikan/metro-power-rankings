// NHL playoff-state reader. Mirrors lib/nba.ts's playoff-state slice but
// scoped to the NHL bracket shape: no play-in, four series rounds
// (Round 1 / Conference Semifinals / Conference Finals / Stanley Cup Final).
//
// The state file at public/data/nhl/playoff-state.json is hand-curated for
// now (NHL.xlsx workbook integration is in flight). Empty by_franchise is
// allowed; the bracket component renders title + Wikipedia link with empty
// round buckets in that case. Once the workbook lands a Year-by-Year sheet
// for NHL the same pattern as build-nba-data.py's read_playoff_state can
// regenerate this file in scripts/build-nhl-data.py.

import { readFileSync } from "fs";
import { join } from "path";

export type NhlPlayoffStateValue =
  | "champion"
  | "lost_final"
  | "eliminated_cf"
  | "eliminated_semis"
  | "eliminated_qf"
  | "active_final"
  | "active_cf"
  | "active_semis"
  | "active_qf";

export type NhlPlayoffStateRecord = {
  state: NhlPlayoffStateValue;
  last_round: string;
  year: number;
};

export type NhlPlayoffStateBundle = {
  year: number | null;
  is_postseason_complete: boolean;
  by_franchise: Record<string, NhlPlayoffStateRecord>;
};

let _bundle: NhlPlayoffStateBundle | null = null;

function read<T>(filename: string): T {
  const path = join(process.cwd(), "public", "data", "nhl", filename);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function getNhlPlayoffState(): NhlPlayoffStateBundle {
  if (!_bundle) {
    try {
      _bundle = read<NhlPlayoffStateBundle>("playoff-state.json");
    } catch {
      _bundle = { year: null, is_postseason_complete: false, by_franchise: {} };
    }
  }
  return _bundle;
}

// Color palette for state chips. Gold for champion / active final to mirror
// the NBA treatment and the existing Stanley-Cup gold chips on the franchise
// page. Slate gradient for earlier active rounds (lighter = earlier round),
// neutral mid-grey for eliminated teams regardless of round.
export const NHL_PLAYOFF_STATE_COLORS: Record<
  NhlPlayoffStateValue,
  { bg: string; text: string; label: string }
> = {
  champion:         { bg: "#d4af37", text: "#1a1408", label: "Stanley Cup Champion" },
  lost_final:       { bg: "#a07a30", text: "#fff",    label: "Lost Stanley Cup Final" },
  eliminated_cf:    { bg: "#5b5b5b", text: "#fff",    label: "Eliminated Conference Finals" },
  eliminated_semis: { bg: "#5b5b5b", text: "#fff",    label: "Eliminated Conference Semifinals" },
  eliminated_qf:    { bg: "#5b5b5b", text: "#fff",    label: "Eliminated First Round" },
  active_final:     { bg: "#d4af37", text: "#1a1408", label: "In the Stanley Cup Final" },
  active_cf:        { bg: "#3a5a8a", text: "#fff",    label: "Conference Finals" },
  active_semis:     { bg: "#5b7aa8", text: "#fff",    label: "Conference Semifinals" },
  active_qf:        { bg: "#6e8aa6", text: "#0c1320", label: "First Round" },
};
