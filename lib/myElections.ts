import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type MyElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type MyElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: MyElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type MyElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: MyElection[];
};

// ---------------- loader ----------------
let _core: MyElectionsFile | null = null;
export function getMyElections(): MyElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "my-elections.json"), "utf-8"),
  ) as MyElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "Alliance": "#1C3E94",
  "Alliance (UMNO–MCA–MIC)": "#1C3E94",
  "BN": "#1C3E94",
  "Barisan Nasional": "#1C3E94",
  "UMNO": "#1C3E94",
  "PH": "#E21118",
  "Pakatan Harapan": "#E21118",
  "PKR": "#00A9E0",
  "DAP": "#ED1C24",
  "PAS": "#009000",
  "BERSATU": "#00565F",
  "PN": "#00565F",
  "Perikatan Nasional": "#00565F",
  "GPS": "#8B0000",
  "PBB": "#8B0000",
  "GRS": "#748CAB",
  "Warisan": "#00BFFF",
  "WARISAN": "#00BFFF",
  "Gerakan": "#B22222",
  "MCA": "#FFD700",
  "MIC": "#006400",
  "PMIP": "#009000",
  "Semangat 46": "#7B2D8B",
  "PBS": "#6B9080",
  "Independent": "#6b7280",
  "Independents": "#6b7280",
  "Others": "#9ca3af",
};
export function myPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Barisan|Alliance|UMNO/i.test(name)) return "#1C3E94";
  if (/Pakatan|PKR/i.test(name)) return "#00A9E0";
  if (/PAS|Islamic/i.test(name)) return "#009000";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function myEraOf(key: string) {
  return getMyElections().eras.find((e) => e.key === key) ?? null;
}
export function myElectionById(id: string): MyElection | null {
  return getMyElections().elections.find((e) => e.id === id) ?? null;
}
export function myNeighbours(id: string): { prev: MyElection | null; next: MyElection | null } {
  const els = getMyElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const myFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const myFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type MyElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeMyRecords(): MyElectionRecord[] {
  const els = getMyElections().elections;
  const recs: MyElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: myFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: myFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: myFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: myFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Years of unbroken rule ended", value: "61", electionId: "2018", detail: "the 2018 turnover — the first change of government since independence" });
  recs.push({ label: "The malapportionment verdict", value: "47%", electionId: "2013", detail: "the BN's losing vote share in 2013 — enough for a comfortable seat majority" });
  return recs;
}
