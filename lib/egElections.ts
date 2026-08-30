import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type EgElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type EgLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: EgElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type EgPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type EgPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: EgPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type EgElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: EgPresElection[];
  legislative: EgLegElection[];
};

// ---------------- loader ----------------
let _core: EgElectionsFile | null = null;
export function getEgElections(): EgElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "eg-elections.json"), "utf-8"),
  ) as EgElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Egyptian party colors; names always accompany the color.
const P: Record<string, string> = {
  "National Democratic Party": "#0B3D91",
  "Arab Socialist Union": "#1B5E20",
  "National Union": "#1B5E20",
  "Wafd Party": "#00713C",
  "New Wafd Party": "#00713C",
  "New Wafd": "#00713C",
  "Freedom and Justice Party": "#0E5A3C",
  "Al-Nour Party": "#F5B301",
  "Liberal Constitutional Party": "#4E79A7",
  "Free Egyptians Party": "#1F77B4",
  "Nation's Future Party": "#C0392B",
  "Muslim Brotherhood independents": "#2E7D32",
  "Independents": "#9ca3af",
  "Presidential appointees": "#78909C",
  "National Party": "#8D6E63",
  "Others": "#9ca3af",
};
export function egPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function egLegEraOf(key: string) {
  return getEgElections().legEras.find((e) => e.key === key) ?? null;
}
export function egPresEraOf(key: string) {
  return getEgElections().presEras.find((e) => e.key === key) ?? null;
}
export function egElectionById(id: string): EgLegElection | EgPresElection | null {
  const f = getEgElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function egLegNeighbours(id: string): { prev: EgLegElection | null; next: EgLegElection | null } {
  const els = getEgElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function egPresNeighbours(id: string): { prev: EgPresElection | null; next: EgPresElection | null } {
  const els = getEgElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const egFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const egFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows
// this atlas labels unfree, are excluded where including them would flatter
// the number rather than explain it.
export type EgElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeEgRecords(): EgElectionRecord[] {
  const { presidential } = getEgElections();
  const recs: EgElectionRecord[] = [];
  const direct = presidential.filter((e) => (e.year >= 1945 && e.year <= 1960) || e.year >= 1989);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: egFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
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
    recs.push({ label: "Closest runoff", value: egFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
    recs.push({ label: "Biggest runoff win", value: egFmtPct(big.w.r2Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const r1 = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r1Votes != null);
  if (r1.length) {
    const most = r1.reduce((a, b) => ((a.c.r1Votes ?? 0) >= (b.c.r1Votes ?? 0) ? a : b));
    recs.push({ label: "Most first-round votes", value: egFmtInt(most.c.r1Votes), electionId: most.e.id, detail: `${most.c.name}, ${most.e.label}` });
  }
  recs.push({ label: "Workers' Party runoff appearances", value: String(presidential.filter((e) => e.year >= 1989 && e.candidates.some((c) => c.r2Share != null && /PT|Workers/.test(c.party ?? ""))).length), electionId: "pres-2002", detail: "every runoff since redemocratisation has featured the PT" });
  return recs;
}
