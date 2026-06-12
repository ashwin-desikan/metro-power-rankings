import "server-only";

// Live WC2026 group standings from ESPN's public fifa.world standings API,
// merged over the workbook-derived bundle so the Group Stage tables update
// between deploys like the other live league tables. Parsed server-side with
// 30-minute revalidation during the tournament; returns null on any failure
// so the page falls back to the workbook bundle and the build never breaks.
//
// Schema verified 2026-06-11: children[] = 12 groups (name "Group A"...),
// children[i].standings.entries[] = { team: { displayName }, stats: [
// gamesPlayed, wins, ties, losses, pointsFor, pointsAgainst,
// pointDifferential, points, rank ] }.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import type { WorldCup2026Bundle } from "@/lib/international";

const ESPN_URL =
  "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026";

export type Wc2026LiveRow = {
  group: string; // "A".."L"
  name: string;  // ESPN displayName
  played: number; w: number; d: number; l: number;
  gs: number; ga: number; gd: number; pts: number;
};

export type Wc2026LiveStandings = {
  source: "espn";
  rows: Wc2026LiveRow[];
} | null;

// ESPN displayName -> workbook cur_name where they diverge.
const NAME_ALIASES: Record<string, string> = {
  "USA": "United States",
  "Czechia": "Czech Republic",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Cabo Verde": "Cape Verde",
};

type EspnStat = { name?: string; value?: number };
type EspnEntry = { team?: { displayName?: string }; stats?: EspnStat[] };
type EspnGroup = { name?: string; standings?: { entries?: EspnEntry[] } };

function statVal(entry: EspnEntry, name: string): number | null {
  const s = entry.stats ? entry.stats.find((x) => x.name === name) : undefined;
  return s && typeof s.value === "number" ? s.value : null;
}

function norm(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.toLowerCase().trim();
}

export async function getWc2026LiveStandings(): Promise<Wc2026LiveStandings> {
  try {
    const res = await fetch(ESPN_URL, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const groups: EspnGroup[] = data?.children ?? [];
    if (groups.length === 0) return null;
    const rows: Wc2026LiveRow[] = [];
    for (const g of groups) {
      const label = (g.name ?? "").replace(/^Group\s+/i, "").trim();
      for (const e of g.standings?.entries ?? []) {
        const name = e.team?.displayName;
        const played = statVal(e, "gamesPlayed");
        if (!name || played === null) continue;
        rows.push({
          group: label,
          name,
          played,
          w: statVal(e, "wins") ?? 0,
          d: statVal(e, "ties") ?? 0,
          l: statVal(e, "losses") ?? 0,
          gs: statVal(e, "pointsFor") ?? 0,
          ga: statVal(e, "pointsAgainst") ?? 0,
          gd: statVal(e, "pointDifferential") ?? 0,
          pts: statVal(e, "points") ?? 0,
        });
      }
    }
    return rows.length > 0 ? { source: "espn", rows } : null;
  } catch {
    return null;
  }
}

// Pure merge: overrides the workbook group rows with live numbers where the
// team resolves by name; unmatched teams keep their workbook line. Returns
// the original bundle untouched when there is nothing to merge.
export function mergeWc2026Live(
  bundle: WorldCup2026Bundle,
  live: Wc2026LiveStandings,
): WorldCup2026Bundle {
  if (!live || live.rows.length === 0) return bundle;
  const byName = new Map<string, Wc2026LiveRow>();
  for (const r of live.rows) {
    byName.set(norm(NAME_ALIASES[r.name] ?? r.name), r);
  }
  let matched = 0;
  const group_stage: WorldCup2026Bundle["group_stage"] = {};
  for (const [key, rows] of Object.entries(bundle.group_stage)) {
    group_stage[key] = rows.map((row) => {
      const lr = byName.get(norm(row.cur_name));
      if (!lr) return row;
      matched += 1;
      return {
        ...row,
        w: lr.w, d: lr.d, l: lr.l,
        gs: lr.gs, ga: lr.ga, gd: lr.gd,
        pts: lr.pts, matches: lr.played,
      };
    });
  }
  if (matched === 0) return bundle;
  return { ...bundle, group_stage, live: { source: "espn" } };
}
