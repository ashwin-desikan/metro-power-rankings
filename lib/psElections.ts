import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PsElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type PsLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: PsElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type PsPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PsPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PsPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type PsElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: PsPresElection[];
  legislative: PsLegElection[];
};

// ---------------- loader ----------------
let _core: PsElectionsFile | null = null;
export function getPsElections(): PsElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ps-elections.json"), "utf-8"),
  ) as PsElectionsFile);
}

// ---------------- party colors ----------------
const P: Record<string, string> = {
  Fatah: "#F2C300", Hamas: "#0B6E4F", "Change and Reform": "#0B6E4F",
  PFLP: "#C1121F", "Abu Ali Mustafa": "#C1121F", DFLP: "#E30613",
  "Third Way": "#4E8EC4", PNI: "#B4540A", "Independent Palestine": "#B4540A",
  PPP: "#8E1B1B", "The Alternative": "#748CAB", FIDA: "#6B9080",
  NDC: "#5B84B1", LIB: "#37517E",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function psPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Hamas|Change and Reform/i.test(name)) return "#0B6E4F";
  if (/Fatah/i.test(name)) return "#F2C300";
  if (/PFLP|Popular Front/i.test(name)) return "#C1121F";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function psLegEraOf(key: string) {
  return getPsElections().legEras.find((e) => e.key === key) ?? null;
}
export function psPresEraOf(key: string) {
  return getPsElections().presEras.find((e) => e.key === key) ?? null;
}
export function psElectionById(id: string): PsLegElection | PsPresElection | null {
  const f = getPsElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function psLegNeighbours(id: string): { prev: PsLegElection | null; next: PsLegElection | null } {
  const els = getPsElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function psPresNeighbours(id: string): { prev: PsPresElection | null; next: PsPresElection | null } {
  const els = getPsElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const psFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const psFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type PsElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePsRecords(): PsElectionRecord[] {
  const recs: PsElectionRecord[] = [];
  recs.push({ label: "Years since the last national vote", value: "20", electionId: "2006", detail: "no presidential or legislative election has been held since January 2006" });
  recs.push({ label: "The Hamas landslide", value: "74", electionId: "2006", detail: "seats of 132 in 2006 — a free and fair election whose result froze Palestinian democracy" });
  recs.push({ label: "Arafat's share", value: "89.8%", electionId: "pres-1996", detail: "the Authority's first presidential vote, against a single token challenger" });
  recs.push({ label: "Abbas's term, as elected", value: "4 yrs", electionId: "pres-2005", detail: "the 2005 mandate has been extended without election for over two decades" });
  recs.push({ label: "Turnout in 2006", value: "71.2%", electionId: "2006", detail: "higher than most established democracies manage — in the last election held" });
  recs.push({ label: "The annulled beginning", value: "1923", electionId: "1923", detail: "the Mandate's only Legislative Council election, boycotted and annulled" });
  return recs;
}
