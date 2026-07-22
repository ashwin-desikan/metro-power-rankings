import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type RuElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type RuLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: RuElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type RuPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type RuPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: RuPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type RuElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: RuPresElection[];
  legislative: RuLegElection[];
};

// ---------------- loader ----------------
let _core: RuElectionsFile | null = null;
export function getRuElections(): RuElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ru-elections.json"), "utf-8"),
  ) as RuElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Russian and Soviet party colors; names always accompany the color.
const P: Record<string, string> = {
  CPSU: "#CC0000", "Communist Party of the Soviet Union": "#CC0000", "Communist Party": "#CC0000",
  "RKP(b)": "#CC0000", "VKP(b)": "#CC0000", "All-Union Communist Party (Bolsheviks)": "#CC0000",
  CPRF: "#C1121F", "Communist Party of the Russian Federation": "#C1121F",
  "United Russia": "#1C3E94", "Unity": "#1C3E94",
  LDPR: "#1E90FF", "Liberal Democratic Party": "#1E90FF", "Liberal Democratic Party of Russia": "#1E90FF",
  KPRF: "#C1121F", "Zhirinovsky Bloc": "#1E90FF",
  Yabloko: "#00A652", YaBL: "#00A652", "A Just Russia": "#F2A900", SRZP: "#F2A900",
  "A Just Russia — For Truth": "#F2A900", "New People": "#00B8C4",
  "Congress of Russian Communities": "#7B2D8B", "Democratic Party of Russia": "#4E8EC4",
  "Our Home – Russia": "#37517E", NDR: "#37517E", "Choice of Russia": "#4E8EC4",
  SPS: "#F4A259", "Union of Right Forces": "#F4A259", OVR: "#6B9080", "Fatherland – All Russia": "#6B9080",
  Rodina: "#8E0000", APR: "#1FA84F", "Agrarian Party of Russia": "#1FA84F",
  "Women of Russia": "#B0578D", PRES: "#748CAB", "Civic Union": "#5A7D9A",
  Kadets: "#4E8EC4", Kadet: "#4E8EC4", "Constitutional Democratic Party": "#4E8EC4", Cadet: "#4E8EC4",
  Octobrist: "#F4A259", "Union of October 17": "#F4A259", Trudoviks: "#7A9E7E",
  SRs: "#C1440E", "Socialist Revolutionary Party": "#C1440E", "Ukrainian SRs": "#D97706",
  Bolsheviks: "#CC0000", Mensheviks: "#E85D75", RSDLP: "#B01C2E", Progressists: "#6FA8DC",
  "Popular Socialists": "#6B9080", Renovation: "#9A8C98", Cossacks: "#8B5E3C",
  Independent: "#6b7280", Independents: "#6b7280", "Non-partisans": "#9ca3af", Others: "#9ca3af",
};
export function ruPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Communist|Bolshevik/i.test(name)) return "#CC0000";
  if (/United Russia|Unity/i.test(name)) return "#1C3E94";
  if (/Liberal Democratic/i.test(name)) return "#1E90FF";
  if (/Yabloko/i.test(name)) return "#00A652";
  if (/Just Russia/i.test(name)) return "#F2A900";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ruLegEraOf(key: string) {
  return getRuElections().legEras.find((e) => e.key === key) ?? null;
}
export function ruPresEraOf(key: string) {
  return getRuElections().presEras.find((e) => e.key === key) ?? null;
}
export function ruElectionById(id: string): RuLegElection | RuPresElection | null {
  const f = getRuElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function ruLegNeighbours(id: string): { prev: RuLegElection | null; next: RuLegElection | null } {
  const els = getRuElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function ruPresNeighbours(id: string): { prev: RuPresElection | null; next: RuPresElection | null } {
  const els = getRuElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ruFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const ruFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// "Records" here are deliberately framed: most Russian and Soviet electoral
// numbers are artefacts of control, and the labels say so.
export type RuElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeRuRecords(): RuElectionRecord[] {
  const { presidential } = getRuElections();
  const recs: RuElectionRecord[] = [];
  recs.push({ label: "Russia's only fully free presidential election", value: "1991", electionId: "pres-1991", detail: "Yeltsin, 58.6% — held while the USSR still existed" });
  const y1996 = presidential.find((e) => e.id === "pres-1996");
  if (y1996) {
    recs.push({ label: "The last contested runoff", value: "1996", electionId: "pres-1996", detail: "Yeltsin over Zyuganov, 54.4% — tilted, but genuinely in doubt" });
  }
  const y2024 = presidential.find((e) => e.id === "pres-2024");
  if (y2024) {
    const w = y2024.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
    recs.push({ label: "Highest announced share", value: ruFmtPct(w?.r1Share), electionId: "pres-2024", detail: "Putin, 2024 — an announced figure of a managed vote, recorded as such" });
  }
  recs.push({ label: "Highest announced Soviet turnout", value: "99.99%", electionId: "1984", detail: "the 1984 ritual — a number that measured obedience, not participation" });
  recs.push({ label: "The first real choice since 1917", value: "1989", electionId: "1989", detail: "contested districts of the Congress of People's Deputies election" });
  recs.push({ label: "Russia's only free election before 1991", value: "1917", electionId: "1917", detail: "the universal-suffrage Constituent Assembly vote — dissolved by the Bolsheviks after one day" });
  recs.push({ label: "The Duma's great shock", value: "1993", electionId: "1993", detail: "Zhirinovsky's LDPR won the party-list vote weeks after tanks shelled the old parliament" });
  const d2007 = getRuElections().legislative.find((e) => e.id === "2007");
  if (d2007) {
    const ur = d2007.parties.find((p) => /United Russia/i.test(p.name ?? ""));
    if (ur?.seats != null) {
      recs.push({ label: "The managed supermajority", value: ruFmtInt(ur.seats), electionId: "2007", detail: "United Russia's 2007 seat haul — Putin atop the list, opponents off the air" });
    }
  }
  recs.push({ label: "Consecutive terms for one man", value: "5", electionId: "pres-2024", detail: "Putin's elections of 2000, 2004, 2012, 2018 and 2024 — plus the 2008 placeholder term" });
  return recs;
}
