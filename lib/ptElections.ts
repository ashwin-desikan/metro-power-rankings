import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PtElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type PtLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: PtElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type PtPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PtPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PtPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type PtElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: PtPresElection[];
  legislative: PtLegElection[];
};

// ---------------- loader ----------------
let _core: PtElectionsFile | null = null;
export function getPtElections(): PtElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "pt-elections.json"), "utf-8"),
  ) as PtElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Portugalian party colors; names always accompany the color.
const P: Record<string, string> = {
  "Socialist Party": "#FF66FF",
  "Portuguese Socialist Party": "#FF66FF",
  "Social Democratic Party": "#F58220",
  "Democratic Alliance": "#F58220",
  "CDS – People's Party": "#0093DD",
  "Democratic and Social Centre": "#0093DD",
  "Unitary Democratic Coalition": "#D6001C",
  "Portuguese Communist Party": "#D6001C",
  "United People Alliance": "#D6001C",
  "Left Bloc": "#8B0000",
  "People Animals Nature": "#00AEA0",
  "Chega": "#202B5B",
  "Liberal Initiative": "#00AEEF",
  "LIVRE": "#8FBC8F",
  "National Union": "#4E4E4E",
  "Portuguese Workers' Communist Party": "#B71C1C",
  "Democratic Renewal Party": "#795548",
  "Popular Democratic Union": "#6D1B7B",
  "People's Monarchist Party": "#1B4F72",
  "Others": "#9ca3af",
};
export function ptPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ptLegEraOf(key: string) {
  return getPtElections().legEras.find((e) => e.key === key) ?? null;
}
export function ptPresEraOf(key: string) {
  return getPtElections().presEras.find((e) => e.key === key) ?? null;
}
export function ptElectionById(id: string): PtLegElection | PtPresElection | null {
  const f = getPtElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function ptLegNeighbours(id: string): { prev: PtLegElection | null; next: PtLegElection | null } {
  const els = getPtElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function ptPresNeighbours(id: string): { prev: PtPresElection | null; next: PtPresElection | null } {
  const els = getPtElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ptFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-PT"));
export const ptFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows
// this atlas labels unfree, are excluded where including them would flatter
// the number rather than explain it.
export type PtElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePtRecords(): PtElectionRecord[] {
  const { presidential } = getPtElections();
  const recs: PtElectionRecord[] = [];
  const direct = presidential.filter((e) => (e.year >= 1945 && e.year <= 1960) || e.year >= 1989);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: ptFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
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
    recs.push({ label: "Closest runoff", value: ptFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
    recs.push({ label: "Biggest runoff win", value: ptFmtPct(big.w.r2Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const r1 = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r1Votes != null);
  if (r1.length) {
    const most = r1.reduce((a, b) => ((a.c.r1Votes ?? 0) >= (b.c.r1Votes ?? 0) ? a : b));
    recs.push({ label: "Most first-round votes", value: ptFmtInt(most.c.r1Votes), electionId: most.e.id, detail: `${most.c.name}, ${most.e.label}` });
  }
  recs.push({ label: "Workers' Party runoff appearances", value: String(presidential.filter((e) => e.year >= 1989 && e.candidates.some((c) => c.r2Share != null && /PT|Workers/.test(c.party ?? ""))).length), electionId: "pres-2002", detail: "every runoff since redemocratisation has featured the PT" });
  return recs;
}
