import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type BrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type BrLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: BrElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type BrPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type BrPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: BrPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type BrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: BrPresElection[];
  legislative: BrLegElection[];
};

// ---------------- loader ----------------
let _core: BrElectionsFile | null = null;
export function getBrElections(): BrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "br-elections.json"), "utf-8"),
  ) as BrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Brazilian party colors; names always accompany the color.
const P: Record<string, string> = {
  PT: "#C4122D", "Workers' Party": "#C4122D",
  PSDB: "#005CA9", "Brazilian Social Democracy Party": "#005CA9",
  MDB: "#2E8B57", PMDB: "#2E8B57", "Brazilian Democratic Movement": "#2E8B57",
  ARENA: "#26547C", "National Renewal Alliance": "#26547C",
  PL: "#1B3F8F", "Liberal Party": "#1B3F8F", PSL: "#FFCC00",
  PSD: "#2364AA", "Social Democratic Party": "#2364AA",
  UDN: "#6C8EAD", "National Democratic Union": "#6C8EAD",
  PTB: "#C0392B", "Brazilian Labour Party": "#C0392B",
  PDS: "#274690", PFL: "#4A7BC8", DEM: "#4A7BC8",
  PRN: "#38A3A5", "National Reconstruction Party": "#38A3A5",
  PDT: "#E63946", "Democratic Labour Party": "#E63946",
  PSB: "#D4A017", "Brazilian Socialist Party": "#D4A017",
  PP: "#5B7DB1", PPB: "#5B7DB1", NOVO: "#F58025", PSOL: "#7B2D8B", Rede: "#2A9D8F",
  PCB: "#A40000", "Brazilian Communist Party": "#A40000", PCdoB: "#8B0000",
  PSP: "#748CAB", "Social Progressive Party": "#748CAB", PR: "#8D6E63",
  PRP: "#8D6E63", "Paulista Republican Party": "#8D6E63", "Republican Party": "#8D6E63",
  "Mineiro Republican Party": "#7A6C5D", PRM: "#7A6C5D",
  "Concentração Conservadora": "#1E3A8A", "Liberal Alliance": "#F4A259",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function brPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Workers/i.test(name)) return "#C4122D";
  if (/Republican/i.test(name)) return "#8D6E63";
  if (/Labou?r/i.test(name)) return "#C0392B";
  if (/Communist/i.test(name)) return "#A40000";
  if (/Socialist/i.test(name)) return "#D4A017";
  if (/Democratic Movement/i.test(name)) return "#2E8B57";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function brLegEraOf(key: string) {
  return getBrElections().legEras.find((e) => e.key === key) ?? null;
}
export function brPresEraOf(key: string) {
  return getBrElections().presEras.find((e) => e.key === key) ?? null;
}
export function brElectionById(id: string): BrLegElection | BrPresElection | null {
  const f = getBrElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function brLegNeighbours(id: string): { prev: BrLegElection | null; next: BrLegElection | null } {
  const els = getBrElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function brPresNeighbours(id: string): { prev: BrPresElection | null; next: BrPresElection | null } {
  const els = getBrElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const brFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
export const brFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the direct-vote eras; the Old Republic's
// arranged counts and the dictatorship's college votes are excluded.
export type BrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeBrRecords(): BrElectionRecord[] {
  const { presidential } = getBrElections();
  const recs: BrElectionRecord[] = [];
  const direct = presidential.filter((e) => (e.year >= 1945 && e.year <= 1960) || e.year >= 1989);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: brFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  const runoffs = presidential
    .filter((e) => e.year >= 1989)
    .map((e) => {
      const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (runoffs.length) {
    const close = runoffs.reduce((a, b) => ((a.w.r2Share ?? 100) <= (b.w.r2Share ?? 100) ? a : b));
    const big = runoffs.reduce((a, b) => ((a.w.r2Share ?? 0) >= (b.w.r2Share ?? 0) ? a : b));
    recs.push({ label: "Closest runoff", value: brFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
    recs.push({ label: "Biggest runoff win", value: brFmtPct(big.w.r2Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const r1 = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r1Votes != null);
  if (r1.length) {
    const most = r1.reduce((a, b) => ((a.c.r1Votes ?? 0) >= (b.c.r1Votes ?? 0) ? a : b));
    recs.push({ label: "Most first-round votes", value: brFmtInt(most.c.r1Votes), electionId: most.e.id, detail: `${most.c.name}, ${most.e.label}` });
  }
  recs.push({ label: "Years without a direct vote", value: "29", electionId: "pres-1989", detail: "1960 to 1989, from Quadros's win to Collor's" });
  recs.push({ label: "Workers' Party runoff appearances", value: String(presidential.filter((e) => e.year >= 1989 && e.candidates.some((c) => c.r2Share != null && /PT|Workers/.test(c.party ?? ""))).length), electionId: "pres-2002", detail: "every runoff since redemocratisation has featured the PT" });
  return recs;
}
