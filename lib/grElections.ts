import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type GrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type GrElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: GrElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type GrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: GrElection[];
};

// ---------------- loader ----------------
let _core: GrElectionsFile | null = null;
export function getGrElections(): GrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "gr-elections.json"), "utf-8"),
  ) as GrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "New Democracy": "#1B78BE",
  "PASOK": "#00A54F",
  "Panhellenic Socialist Movement": "#00A54F",
  "PASOK – Movement for Change": "#00A54F",
  "Syriza": "#E42227",
  "SYRIZA": "#E42227",
  "Communist Party of Greece": "#B71C1C",
  "Golden Dawn": "#26343F",
  "Greek Solution": "#0F3B66",
  "MeRA25": "#A0195B",
  "Course of Freedom": "#7B1FA2",
  "Independent Greeks": "#0B5394",
  "The River": "#00B0B9",
  "Potami": "#00B0B9",
  "Popular Orthodox Rally": "#2A4B8D",
  "Liberal Party": "#F2A900",
  "People's Party": "#3C6E9F",
  "United Democratic Left": "#C62828",
  "National Radical Union": "#1565C0",
  "Centre Union": "#F9A825",
  "Union of Centrists": "#F9A825",
  "Progressive Party": "#6A1B9A",
  "New Left": "#D81B60",
  "Victory": "#455A64",
  "Independents": "#9ca3af",
  "List of Independents": "#9ca3af",
  "Others": "#9ca3af",
};
export function grPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function grEraOf(key: string) {
  return getGrElections().eras.find((e) => e.key === key) ?? null;
}
export function grElectionById(id: string): GrElection | null {
  return getGrElections().elections.find((e) => e.id === id) ?? null;
}
export function grNeighbours(id: string): { prev: GrElection | null; next: GrElection | null } {
  const els = getGrElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const grFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const grFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type GrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeGrRecords(): GrElectionRecord[] {
  const els = getGrElections().elections;
  const recs: GrElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: grFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: grFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: grFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: grFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Social Democrats largest party", value: "77 yrs", electionId: "2001", detail: "from 1924 until Fogh Rasmussen's 2001 bloc shift — then again from 2019" });
  return recs;
}
