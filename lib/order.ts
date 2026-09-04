import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Order layer. Two datasets, both built by scripts/order/build_order_data.py
// from JSON already committed under public/data, so there is no network call and
// no second source of truth. Read at build time like the rest of the country
// data: these files change when the Power Atlas, the constitutions chronology or
// the V-Dem cross-section change, which is a handful of times a year, not daily.

// The nine positions a state can occupy. "vanguard" is deliberately absent:
// the corner is not a position, it is what the axes point at. See VANGUARD in
// scripts/order/build_order_data.py.
export type OrderCell =
  | "pure-witness" | "passenger" | "noise"
  | "stabilizer" | "institutional-machine" | "asymmetric-exploit"
  | "the-approach" | "opportunist" | "terminal-void";

export type OrderCountry = {
  slug: string;
  name: string;
  continent: string | null;
  force: number;
  integrity: number;
  integrityRaw: number;
  /** Absolute distance from the corner, 0 to 100. Higher is further away. */
  vanguardDistance: number;
  imbalance: number;
  cell: OrderCell;
  cellName: string;
  cellBlurb: string;
  rec: number;
  lat: number | null;
  share: number | null;
  powerRank: number | null;
  tier: string | null;
  ruleOfLaw: number | null;
  constitutionAge: number | null;
  constitutionAdopted: number | null;
  constitutionForm: "codified" | "uncodified" | "unrecorded";
  adoptedSource: "chronology" | "curated" | "uncodified" | null;
  adoptedNote: string | null;
  constitutionDocs: number | null;
  constitutionWords: number | null;
  suspensions: number | null;
  amendPerDecade: number | null;
  durability: number | null;
  durabilitySource: "age" | "uncodified" | "unavailable";
  uncodified: boolean;
  stability: number;
};

export type OrderCellMeta = { key: OrderCell; name: string; blurb: string; force: number; integrity: number };

export type OrderGrid = {
  built: string;
  year: number;
  meta: {
    title: string;
    axes: { force: string; integrity: string };
    vanguard: { key: string; name: string; blurb: string; occupiable: false; why: string };
    vanguardDistance: string;
    notAMoralityRanking: string;
    pending: string[];
    sources: string[];
    cells: OrderCellMeta[];
    coverage: {
      inPowerAtlas: number;
      scored: number;
      unscored: number;
      durabilityFromAge: number;
      durabilityUncodified: number;
      durabilityUnavailable: number;
      cellCounts: Record<string, number>;
      vanguardCount: number;
      closestDistance: number | null;
      closestName: string | null;
      medianDistance: number | null;
    };
  };
  countries: OrderCountry[];
  unscored: { slug: string; name: string; missing: string[] }[];
};

export type GapRow = {
  slug: string;
  name: string;
  rank: number | null;
  tier: string | null;
  share: number | null;
  lat: number;
  rec: number;
  gap: number;
};

export type RecognitionGap = {
  built: string;
  year: number;
  meta: {
    title: string;
    definition: string;
    reading: { positive: string; negative: string };
    seriesFrom: number;
    seriesNote: string;
    openQuestion: string;
    sources: string[];
  };
  current: GapRow[];
  series: Record<string, [number, number][]>;
};

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", "data", "order", file), "utf8")) as T;
}

export function getOrderGrid(): OrderGrid {
  return read<OrderGrid>("order-grid.json");
}

export function getRecognitionGap(): RecognitionGap {
  return read<RecognitionGap>("recognition-gap.json");
}

/** The 3x3 laid out for display: integrity high at the top, force low on the left. */
export function cellMatrix(grid: OrderGrid): OrderCellMeta[][] {
  const at = (f: number, i: number) => grid.meta.cells.find((c) => c.force === f && c.integrity === i)!;
  return [
    [at(0, 2), at(1, 2), at(2, 2)],
    [at(0, 1), at(1, 1), at(2, 1)],
    [at(0, 0), at(1, 0), at(2, 0)],
  ];
}

export function membersOf(grid: OrderGrid, cell: OrderCell): OrderCountry[] {
  // Nearest the corner first WITHIN the cell. Sorting by force alone put the
  // most powerful state at the head of a low-integrity cell, which read as
  // "this one is the worst" when it was the opposite.
  return grid.countries
    .filter((c) => c.cell === cell)
    .sort((a, b) => a.vanguardDistance - b.vanguardDistance);
}

export type FlagSpell = { from: number; to: number | null; who: string[] };

export type TrajectoryCountry = {
  slug: string;
  name: string;
  onGrid: boolean;
  cell: OrderCell | null;
  cellName: string | null;
  flags: {
    currentlyFlagged: boolean;
    flaggedSince: number | null;
    enteredFlagWithin: number | null;
    newlyFlagged: boolean;
    spellCount: number;
    yearsFlaggedSince1900: number;
    yearsSinceLastFlagEnded: number | null;
    spells: FlagSpell[];
  };
  force: {
    now: number | null;
    back20: number | null;
    back50: number | null;
    delta20: number | null;
    delta50: number | null;
  };
  constitution: {
    adopted: number | null;
    ageYears: number | null;
    uncodified: boolean;
    systemsSince1789: number | null;
    suspensions: number | null;
    interims: number | null;
    rupturesInWindow: number;
    lastRupture: number | null;
    endedLastOrder: string | null;
  };
  leadership: {
    currentLeader: string | null;
    since: number | null;
    tenureYears: number | null;
    medianTenure: number | null;
    leadersSince2000: number | null;
  };
  accountability: {
    turnoutLatest: number | null;
    turnoutMedianPost1945: number | null;
    turnoutDelta: number | null;
    disproportionalityLatest: number | null;
    disproportionalityMedian: number | null;
    disproportionalityDelta: number | null;
  } | null;
  conflict: { since2000: number; ongoing: number; total: number };
};

export type Trajectory = {
  built: string;
  year: number;
  meta: {
    title: string;
    thesis: string;
    noComposite: string;
    curatedFlagWarning: string;
    signals: Record<string, string>;
    windows: { recentFlagYears: number; stressWindow: number; panelFrom: number };
    coverage: {
      countries: number;
      onGrid: number;
      withFlagHistory: number;
      currentlyFlagged: number;
      newlyFlagged: number;
      withForceTrend: number;
      withAccountability: number;
      withRuptureInWindow: number;
    };
    sources: string[];
  };
  countries: TrajectoryCountry[];
};

export function getTrajectory(): Trajectory {
  return read<Trajectory>("trajectory.json");
}
