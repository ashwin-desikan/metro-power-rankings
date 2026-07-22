import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type IqElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type IqLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: IqElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type IqPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type IqPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: IqPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type IqElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: IqPresElection[];
  legislative: IqLegElection[];
};

// ---------------- loader ----------------
let _core: IqElectionsFile | null = null;
export function getIqElections(): IqElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "iq-elections.json"), "utf-8"),
  ) as IqElectionsFile);
}

// ---------------- party colors ----------------
const P: Record<string, string> = {
  "Ba'ath Party": "#006233", NPF: "#006233",
  "Sadrist Movement": "#0B6E4F", "Al-Sadiqoun": "#0B6E4F",
  "State of Law": "#8E1B1B", "State of Law Coalition": "#8E1B1B", DFC: "#8E1B1B",
  RDC: "#1C6DD0", "Furatayn Movement": "#1C6DD0",
  KDP: "#F2C300", PUK: "#2E8B57", "Kurdistani Coalition": "#2E8B57",
  "Progress Party": "#37517E", Takadum: "#37517E", "Al-Anbar": "#37517E", Qimam: "#37517E",
  Fatah: "#7A1F1F", Badr: "#7A1F1F", "Fatah Alliance": "#7A1F1F",
  "Azem Alliance": "#748CAB", Azem: "#748CAB", Sovereignty: "#8B5E3C", AP: "#8B5E3C",
  "United Iraqi Alliance": "#0F6E4F", "Iraqi National Movement": "#4E8EC4", "Iraqi National List": "#4E8EC4",
  "Alliance Towards Reforms": "#0B6E4F", "Victory Alliance": "#2B6CB0", ANSF: "#2B6CB0",
  NSF: "#6B9080", "National Coalition": "#4E8EC4", "Iraqi Accord Front": "#B4540A",
  "Democratic Patriotic Alliance of Kurdistan": "#F2C300", "Kurdistani Alliance": "#F2C300",
  CUP: "#37517E", "Constitutional Union Party": "#37517E",
  "United Popular Front": "#B4540A", "National Democratic Party": "#6B9080",
  Independence: "#8B5E3C", "Iraqi Independence Party": "#8B5E3C", "Pro-government": "#748CAB",
  Emtidad: "#00B8C4", NGM: "#5F2C82", "Rights Movement": "#B0578D",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function iqPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Ba'ath|Baath/i.test(name)) return "#006233";
  if (/Sadr/i.test(name)) return "#0B6E4F";
  if (/State of Law|Dawa/i.test(name)) return "#8E1B1B";
  if (/KDP|Kurdistan Democratic/i.test(name)) return "#F2C300";
  if (/PUK|Patriotic Union/i.test(name)) return "#2E8B57";
  if (/Kurd/i.test(name)) return "#D4A017";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function iqLegEraOf(key: string) {
  return getIqElections().legEras.find((e) => e.key === key) ?? null;
}
export function iqPresEraOf(key: string) {
  return getIqElections().presEras.find((e) => e.key === key) ?? null;
}
export function iqElectionById(id: string): IqLegElection | IqPresElection | null {
  const f = getIqElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function iqLegNeighbours(id: string): { prev: IqLegElection | null; next: IqLegElection | null } {
  const els = getIqElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function iqPresNeighbours(id: string): { prev: IqPresElection | null; next: IqPresElection | null } {
  const els = getIqElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const iqFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const iqFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type IqElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeIqRecords(): IqElectionRecord[] {
  const recs: IqElectionRecord[] = [];
  recs.push({ label: "The purple-finger election", value: "2005", electionId: "jan-2005", detail: "the first real vote in half a century, held under insurgent fire in January 2005" });
  recs.push({ label: "Saddam's announced share", value: "100%", electionId: "pres-2002", detail: "the 2002 referendum — every one of 11.4 million official votes recorded as a yes" });
  recs.push({ label: "Closest election", value: "2 seats", electionId: "2010", detail: "Allawi's Iraqiyya 91, Maliki's State of Law 89 in 2010 — and nine months to form a government" });
  recs.push({ label: "Lowest turnout", value: "43.3%", electionId: "2021", detail: "the 2021 early election after the Tishreen uprising — the post-2003 low" });
  recs.push({ label: "Seats uncontested in 1954", value: "110", electionId: "sep-1954", detail: "the September 1954 election: only 25 of 135 seats were actually contested" });
  recs.push({ label: "Consecutive competitive elections", value: "7", electionId: "2025", detail: "January 2005 through November 2025 — an unbroken run no neighbour save Israel can match" });
  return recs;
}
