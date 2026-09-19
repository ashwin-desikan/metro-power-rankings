import { describe, it, expect } from "vitest";
import { __testing } from "./clubFootballLive";

const { dedupeLeague, splitSeasonRank } = __testing;

// Shapes copied from public/data/football/live-standings-2026.json on 2026-09-19,
// trimmed to the fields dedupeLeague reads.
type Row = { team_id: number | null; name: string | null; lookup: string | null; country: string | null; rank?: number; points?: number };
const row = (name: string, rank: number, points: number): Row =>
  ({ team_id: null, name, lookup: null, country: null, rank, points });

const league = (groups: { group_label: string; rows: Row[] }[]) =>
  ({ league_id: 1, name: "L", country: "C", level: 1, groups } as never);

describe("dedupeLeague", () => {
  // The bug, 2026-09-19. Argentina and Uruguay play both halves of a split season
  // with the SAME clubs, so a team-sheet key collapsed them to one table and the
  // hub showed the Apertura alone. Ashwin found it on the page; nothing logged.
  it("keeps Apertura and Clausura, which share a team sheet but not a table", () => {
    const l = dedupeLeague(league([
      { group_label: "Apertura - Group A", rows: [row("Boca", 1, 30), row("River", 2, 28)] },
      { group_label: "Clausura - Group A", rows: [row("River", 1, 12), row("Boca", 2, 9)] },
    ]));
    expect(l.groups.map((g) => g.group_label)).toEqual(["Clausura - Group A", "Apertura - Group A"]);
  });

  // The case the rule was written for, which must keep working: api-football
  // serving one table twice under two spellings ("Premier Division" + "Premier
  // League"). Same teams AND same values, so it is a genuine duplicate.
  it("still drops the same table served under a second label spelling", () => {
    const rows = [row("Shamrock", 1, 40), row("Derry", 2, 35)];
    const l = dedupeLeague(league([
      { group_label: "Premier Division", rows },
      { group_label: "Premier League", rows: rows.map((r) => ({ ...r })) },
    ]));
    expect(l.groups.map((g) => g.group_label)).toEqual(["Premier Division"]);
  });

  it("drops nameless rows and same-team duplicate rows inside a group", () => {
    const l = dedupeLeague(league([
      { group_label: "A", rows: [row("Flamengo", 1, 50), { ...row("", 20, 0) }, row("Flamengo", 20, 50)] },
    ]));
    expect(l.groups[0].rows.map((r) => r.name)).toEqual(["Flamengo"]);
  });

  it("leaves a genuine multi-group league alone", () => {
    const l = dedupeLeague(league([
      { group_label: "Group 1", rows: [row("A", 1, 10)] },
      { group_label: "Group 2", rows: [row("B", 1, 10)] },
    ]));
    expect(l.groups.map((g) => g.group_label)).toEqual(["Group 1", "Group 2"]);
  });

  // Uruguay carries five tables over one club set: the two halves plus the
  // aggregate ones. All five survive, Clausura leads, the rest keep feed order.
  it("keeps Uruguay's five tables with Clausura first and the aggregates after", () => {
    const l = dedupeLeague(league([
      { group_label: "Primera: Apertura", rows: [row("Penarol", 1, 30), row("Nacional", 2, 28)] },
      { group_label: "Primera: Clausura", rows: [row("Nacional", 1, 12), row("Penarol", 2, 9)] },
      { group_label: "Primera: Promedios", rows: [row("Penarol", 1, 99), row("Nacional", 2, 90)] },
      { group_label: "Primera: Tabla Anual", rows: [row("Nacional", 1, 55), row("Penarol", 2, 54)] },
      { group_label: "Primera: Torneo Intermedio", rows: [row("Penarol", 1, 7), row("Nacional", 2, 6)] },
    ]));
    expect(l.groups.map((g) => g.group_label)).toEqual([
      "Primera: Clausura",
      "Primera: Apertura",
      "Primera: Promedios",
      "Primera: Tabla Anual",
      "Primera: Torneo Intermedio",
    ]);
  });
});

describe("splitSeasonRank", () => {
  it("puts the Clausura ahead of the Apertura and everything else last", () => {
    expect(splitSeasonRank("Clausura - Group B")).toBeLessThan(splitSeasonRank("Apertura - Group A"));
    expect(splitSeasonRank("Apertura - Group A")).toBeLessThan(splitSeasonRank("Primera: Promedios"));
  });
  it("is case-insensitive, because the feed's spelling is not ours to rely on", () => {
    expect(splitSeasonRank("primera: clausura")).toBe(0);
  });
});
