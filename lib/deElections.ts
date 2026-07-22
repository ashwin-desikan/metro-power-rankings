import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type DeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent (second/list vote where the source reports it)
  swing: number | null; // percentage points
};
export type DeElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null; // percent
  parties: DeElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // chancellor / head of government
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  // "partial" = March 1933, held under terror; "unfree" = single-list Nazi
  // plebiscites. Rendered with an explicit caveat, never as normal elections.
  unfree?: "partial" | "unfree" | null;
};
export type DeElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: DeElection[];
};

// ---------------- loader ----------------
let _core: DeElectionsFile | null = null;
export function getDeElections(): DeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "de-elections.json"), "utf-8"),
  ) as DeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional German party colors across three constitutional orders; CDU's
// black is lightened for dark backgrounds. Names always accompany the color.
const P: Record<string, string> = {
  SPD: "#E3000F", "Social Democratic": "#E3000F", USPD: "#C94F7C",
  "CDU/CSU": "#5C5C66", CDU: "#5C5C66", CSU: "#0C6CB4",
  FDP: "#E5B800", FVP: "#E5B800", DDP: "#F2C14E", DStP: "#F2C14E",
  Greens: "#46962B", "Alliance 90/The Greens": "#46962B", "The Greens": "#46962B",
  AfD: "#009EE0", "The Left": "#BE3075", Left: "#BE3075", PDS: "#BE3075", "Left List/PDS": "#BE3075",
  BSW: "#7B2D8B", Zentrum: "#26547C", Centre: "#26547C", BVP: "#3D6B8E",
  KPD: "#A40000", NSDAP: "#6B4423", DNVP: "#6E4B1F", DVP: "#F0A202",
  "National Liberal": "#F2C14E", NLP: "#F2C14E",
  Conservative: "#1E3A8A", DKP: "#1E3A8A", "Free Conservative": "#3B5BA5", FKP: "#3B5BA5", DRP: "#3B5BA5",
  Progress: "#FBBF24", FVp: "#FBBF24", "German Progress": "#FBBF24",
  "German People's": "#F0A202", "Economic Party": "#8C7851",
  Poles: "#A3243B", "Polish Party": "#A3243B", Guelphs: "#587B7F", "Danish Party": "#7F9C96",
  Liberal: "#F4B860", "Left Liberal": "#FBBF24",
  Welfs: "#587B7F", "German-Hanoverian": "#587B7F",
  GB_BHE: "#7A6C5D", "GB/BHE": "#7A6C5D", DP: "#4C6663", "German Party": "#4C6663",
  Independent: "#6b7280", Independents: "#6b7280", Other: "#9ca3af", Others: "#9ca3af",
};
export function dePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Social Democratic|SPD/i.test(name)) return "#E3000F";
  if (/Christian Democratic|Christian Social/i.test(name)) return "#5C5C66";
  if (/Communist/i.test(name)) return "#A40000";
  if (/Conservative/i.test(name)) return "#1E3A8A";
  if (/Liberal|Progress/i.test(name)) return "#F2C14E";
  if (/Centre|Zentrum/i.test(name)) return "#26547C";
  if (/Green/i.test(name)) return "#46962B";
  return "#9ca3af";
}

// The postwar Volksparteien, for the two-party chart.
export const DE_BIG_TWO = new Set(["CDU/CSU", "SPD"]);

// ---------------- helpers ----------------
export function deEraOf(key: string) {
  return getDeElections().eras.find((e) => e.key === key) ?? null;
}
export function deElectionById(id: string): DeElection | null {
  return getDeElections().elections.find((e) => e.id === id) ?? null;
}
export function deNeighbours(id: string): { prev: DeElection | null; next: DeElection | null } {
  const els = getDeElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const deFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("de-DE"));
export const deFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset. Unfree votes are
// excluded — a 99% "turnout" under a dictatorship is not a record.
export type DeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeDeRecords(): DeElectionRecord[] {
  const els = getDeElections().elections.filter((e) => !e.unfree);
  const recs: DeElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout (free elections)", value: deFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} federal election` });
    recs.push({ label: "Lowest turnout", value: deFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} federal election` });
  }
  const withShare = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: deFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: deFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  const bonn = els.filter((e) => e.year >= 1949);
  const bigTwo = bonn
    .map((e) => {
      const s = e.parties.filter((p) => p.name != null && DE_BIG_TWO.has(p.name)).reduce((acc, p) => acc + (p.share ?? 0), 0);
      return { e, s };
    })
    .filter((x) => x.s > 0);
  if (bigTwo.length) {
    const peak = bigTwo.reduce((a, b) => (a.s >= b.s ? a : b));
    const trough = bigTwo.reduce((a, b) => (a.s <= b.s ? a : b));
    recs.push({ label: "Volksparteien at their peak", value: deFmtPct(peak.s), electionId: peak.e.id, detail: `CDU/CSU + SPD combined, ${peak.e.label}` });
    recs.push({ label: "Volksparteien at their weakest", value: deFmtPct(trough.s), electionId: trough.e.id, detail: `CDU/CSU + SPD combined, ${trough.e.label}` });
  }
  return recs;
}
