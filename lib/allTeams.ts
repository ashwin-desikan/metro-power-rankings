import "server-only";

// Real (specific) league for a team, read from all-teams.json. The metro
// workbook that feeds MetroDetail.teams tags foreign and minor-league baseball
// generically as "Minor Lg Base"; all-teams.json carries the actual league
// (KBO, NPB, International League, Pacific Coast League, Mexican League, ...),
// so the metro team cards can show the real competition name.

import { readFileSync } from "fs";
import { join } from "path";

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let _baseball: Map<string, string> | null = null;
function baseballLeagues(): Map<string, string> {
  if (_baseball) return _baseball;
  const m = new Map<string, string>();
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "sports", "all-teams.json"), "utf-8"),
    ) as unknown;
    const arr = Array.isArray(raw)
      ? raw
      : ((raw as { teams?: unknown[] }).teams ?? []);
    for (const t of arr as Array<{ sport?: string; team?: string; league?: string }>) {
      if (t && t.sport === "Baseball" && t.team && t.league) {
        m.set(norm(t.team), t.league);
      }
    }
  } catch {
    // missing/unreadable file -> empty map; callers fall back to the raw league
  }
  _baseball = m;
  return m;
}

// Actual baseball league for a team name, or null when unknown.
export function getBaseballLeagueByName(name: string): string | null {
  return baseballLeagues().get(norm(name)) ?? null;
}
