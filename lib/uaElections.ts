import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type UaElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type UaLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: UaElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type UaPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type UaPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: UaPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type UaElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: UaPresElection[];
  legislative: UaLegElection[];
};

// ---------------- loader ----------------
let _core: UaElectionsFile | null = null;
export function getUaElections(): UaElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ua-elections.json"), "utf-8"),
  ) as UaElectionsFile);
}

// ---------------- party colors ----------------
const P: Record<string, string> = {
  "Servant of the People": "#69B34C",
  "Party of Regions": "#0057B7", "Opposition Platform — For Life": "#0057B7", "Opposition Bloc": "#30469B",
  Batkivshchyna: "#E30613", "Yulia Tymoshenko Bloc": "#E30613", BYuT: "#E30613",
  "Our Ukraine": "#FF7F00", "Our Ukraine Bloc": "#FF7F00", "Our Ukraine–People's Self-Defense Bloc": "#FF7F00",
  "Petro Poroshenko Bloc": "#E4003B", "European Solidarity": "#E4003B",
  "People's Front": "#C8102E", Holos: "#5F2C82", Samopomich: "#F4A900", "Self Reliance": "#F4A900",
  KPU: "#CC0000", "Communist Party of Ukraine": "#CC0000", "Communist Party": "#CC0000",
  "Socialist Party of Ukraine": "#C1440E", "Progressive Socialist Party of Ukraine": "#8E0000",
  "People's Movement of Ukraine": "#5B84B1", Rukh: "#5B84B1",
  "Radical Party": "#7DB343", Svoboda: "#5A3E1B", "For a United Ukraine!": "#37517E",
  "United Social Democratic Party of Ukraine": "#B0578D", Hromada: "#6B9080",
  "Green Party of Ukraine": "#1FA84F", "People's Democratic Party": "#748CAB",
  Fatherland: "#E30613", "Strong Ukraine": "#2B6CB0", "Civil Position": "#4E8EC4",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function uaPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Servant of the People/i.test(name)) return "#69B34C";
  if (/Regions|For Life|Opposition/i.test(name)) return "#0057B7";
  if (/Tymoshenko|Batkivshchyna|Fatherland/i.test(name)) return "#E30613";
  if (/Poroshenko|European Solidarity/i.test(name)) return "#E4003B";
  if (/Communist/i.test(name)) return "#CC0000";
  if (/Socialist/i.test(name)) return "#C1440E";
  if (/Our Ukraine/i.test(name)) return "#FF7F00";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function uaLegEraOf(key: string) {
  return getUaElections().legEras.find((e) => e.key === key) ?? null;
}
export function uaPresEraOf(key: string) {
  return getUaElections().presEras.find((e) => e.key === key) ?? null;
}
export function uaElectionById(id: string): UaLegElection | UaPresElection | null {
  const f = getUaElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function uaLegNeighbours(id: string): { prev: UaLegElection | null; next: UaLegElection | null } {
  const els = getUaElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function uaPresNeighbours(id: string): { prev: UaPresElection | null; next: UaPresElection | null } {
  const els = getUaElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const uaFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const uaFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type UaElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeUaRecords(): UaElectionRecord[] {
  const recs: UaElectionRecord[] = [];
  recs.push({ label: "Biggest landslide", value: "74.96%", electionId: "pres-2019", detail: "Zelenskyy over Poroshenko in the 2019 runoff — the largest margin in Ukrainian history" });
  recs.push({ label: "Incumbent presidents defeated", value: "3", electionId: "pres-2019", detail: "Kravchuk 1994, Yushchenko 2010, Poroshenko 2019 — only Kuchma ever won re-election" });
  recs.push({ label: "The revolution's election", value: "2004", electionId: "pres-2004", detail: "the falsified runoff, the Orange Revolution, and the court-ordered re-run Yushchenko won" });
  recs.push({ label: "Only single-party majority", value: "254", electionId: "2019", detail: "Servant of the People's 2019 sweep — the first outright Rada majority since independence" });
  recs.push({ label: "Highest turnout", value: "84.18%", electionId: "pres-1991", detail: "the December 1991 presidential vote, held the same day as the independence referendum" });
  recs.push({ label: "Wartime ballots", value: "4", electionId: "pres-2014", detail: "the presidential and Rada votes of 2014 and 2019, all held with the Donbas at war" });
  return recs;
}
