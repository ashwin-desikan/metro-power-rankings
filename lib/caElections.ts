import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CaElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null; // percentage points
};
export type CaProvinceParty = {
  name: string;
  seats: (number | null)[]; // aligned with provinces.codes; null = did not contest
  votes: (number | null)[]; // vote share %, aligned; 0.0 = under 0.05%
  totalSeats: number | null;
  totalVote: number | null;
};
export type CaProvinces = {
  codes: string[];
  labels: Record<string, string>;
  parties: CaProvinceParty[];
  seatTotals: number[] | null;
  totalSeats: number | null;
};
export type CaElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number;
  majoritySeats: number | null;
  turnout: number | null; // percent
  parties: CaElectionParty[];
  pmBefore: { name: string; party: string } | null;
  pmAfter: { name: string; party: string } | null;
  government: { party: string; pm: string; type: "majority" | "minority" } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  provinces?: CaProvinces;
};
export type CaElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: CaElection[];
};

// ---------------- loader ----------------
// The historical record only changes at a general election (next due by 2029),
// so this stays a build-time read, like the UK and US core files.
let _core: CaElectionsFile | null = null;
export function getCaElections(): CaElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ca-elections.json"), "utf-8"),
  ) as CaElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Canadian party colors; the Conservative family shifts shade by
// incarnation so adjacent eras stay distinguishable. Names always accompany
// the color.
const P: Record<string, string> = {
  Liberal: "#D71920", "Laurier Liberal": "#D71920", "Liberal-Progressive": "#B84C5E",
  Conservative: "#1A4782", "Liberal-Conservative": "#3D6CB0", Unionist: "#3D6CB0",
  "Progressive Conservative": "#4A70B8", "National Government": "#3D6CB0",
  "New Democratic": "#F37021", CCF: "#DE7B00", "Co-operative Commonwealth": "#DE7B00",
  "Bloc Québécois": "#33B2CC", "Bloc populaire": "#2E86AB",
  Reform: "#3CB371", "Canadian Alliance": "#4F9A4C",
  "Social Credit": "#1B5E20", "Ralliement créditiste": "#2E7D32", "New Democracy": "#66823C",
  Progressive: "#74C365", "United Farmers of Alberta": "#5A8F4E", "United Farmers of Ontario": "#5A8F4E",
  Green: "#3D9B35", "People's": "#4A3B8C",
  "Anti-Confederation": "#8D6E63", Reconstruction: "#7C6FA0",
  "Independent Labour": "#B03060", "Labor–Progressive": "#8B0000",
  Independent: "#6b7280", Others: "#6b7280", Other: "#6b7280",
  // province-table party names not in the national infoboxes
  Labour: "#B03060", "Liberal-Labour": "#C2547E", "UFO-Labour": "#5A8F4E", Unknown: "#6b7280",
  "Independent Liberal": "#E58A8A", "Independent Conservative": "#7C9CC9",
  "Independent Progressive": "#9CC98F", "Independents and minor parties": "#6b7280",
  "National Liberal and Conservative": "#3D6CB0", "Nationalist Conservative": "#2E5C9E",
};
export function caPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  return P[name] ?? P[name.replace(/\s+Party$/i, "").trim()] ?? "#9ca3af";
}

// The Liberal + Conservative-family duopoly, for the two-party trend chart.
export const CA_TWO_PARTY = new Set([
  "Liberal", "Laurier Liberal", "Conservative", "Liberal-Conservative", "Unionist",
  "Progressive Conservative",
]);

// ---------------- helpers ----------------
export function caEraOf(key: string) {
  return getCaElections().eras.find((e) => e.key === key) ?? null;
}
export function caElectionById(id: string): CaElection | null {
  return getCaElections().elections.find((e) => e.id === id) ?? null;
}
export function caNeighbours(id: string): { prev: CaElection | null; next: CaElection | null } {
  const els = getCaElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-CA"));
export const fmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset (no hand-entered figures).
export type CaElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCaRecords(): CaElectionRecord[] {
  const els = getCaElections().elections;
  const recs: CaElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
  const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
  recs.push({ label: "Highest turnout", value: fmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
  recs.push({ label: "Lowest turnout", value: fmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  const seatHaul = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null)
    .reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
  recs.push({ label: "Most seats won", value: fmtInt(seatHaul.p.seats), electionId: seatHaul.e.id, detail: `${seatHaul.p.name}, ${seatHaul.e.label}` });
  const seatShare = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null && x.e.totalSeats > 0)
    .reduce((a, b) => ((a.p.seats ?? 0) / a.e.totalSeats >= (b.p.seats ?? 0) / b.e.totalSeats ? a : b));
  recs.push({
    label: "Biggest share of the House",
    value: `${(((seatShare.p.seats ?? 0) / seatShare.e.totalSeats) * 100).toFixed(1)}%`,
    electionId: seatShare.e.id,
    detail: `${seatShare.p.name}, ${seatShare.e.label}: ${seatShare.p.seats} of ${seatShare.e.totalSeats} seats`,
  });
  const mostVotes = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.votes != null)
    .reduce((a, b) => ((a.p.votes ?? 0) >= (b.p.votes ?? 0) ? a : b));
  recs.push({ label: "Most votes for one party", value: fmtInt(mostVotes.p.votes), electionId: mostVotes.e.id, detail: `${mostVotes.p.name}, ${mostVotes.e.label}` });
  // biggest winner's bonus: winner's seat share minus vote share
  const disp = els
    .map((e) => {
      const w = e.parties.find((p) => p.name === e.seatLeader);
      if (!w || w.share == null || w.seats == null || !e.totalSeats) return null;
      return { e, gap: (w.seats / e.totalSeats) * 100 - w.share, w };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .reduce((a, b) => (a.gap >= b.gap ? a : b));
  recs.push({
    label: "Biggest winner's bonus",
    value: `+${disp.gap.toFixed(1)} pts`,
    electionId: disp.e.id,
    detail: `${disp.w.name} turned ${fmtPct(disp.w.share)} of votes into ${(((disp.w.seats ?? 0) / disp.e.totalSeats) * 100).toFixed(1)}% of seats, ${disp.e.label}`,
  });
  return recs;
}
