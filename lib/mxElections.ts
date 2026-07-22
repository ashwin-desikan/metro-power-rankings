import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type MxElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type MxLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: MxElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type MxPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type MxPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: MxPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type MxElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: MxPresElection[];
  legislative: MxLegElection[];
};

// ---------------- loader ----------------
let _core: MxElectionsFile | null = null;
export function getMxElections(): MxElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "mx-elections.json"), "utf-8"),
  ) as MxElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Mexican party colors; names always accompany the color.
const P: Record<string, string> = {
  PRI: "#006341", "Institutional Revolutionary Party": "#006341",
  PNR: "#0B5D3E", PRM: "#0B5D3E", "National Revolutionary Party": "#0B5D3E",
  PAN: "#0059A7", "National Action Party": "#0059A7",
  PRD: "#F5C400", "Party of the Democratic Revolution": "#F5C400",
  Morena: "#A6032F", MORENA: "#A6032F", "National Regeneration Movement": "#A6032F",
  "Sigamos Haciendo Historia": "#A6032F", "Juntos Hacemos Historia": "#A6032F",
  "Fuerza y Corazón por México": "#0059A7",
  PVEM: "#4CAF50", "Ecologist Green Party": "#4CAF50", "Ecologist Green Party of Mexico": "#4CAF50",
  PT: "#D52B1E", "Labor Party": "#D52B1E",
  MC: "#F58025", "Citizens' Movement": "#F58025", "Movimiento Ciudadano": "#F58025",
  PES: "#5E4B8B", PANAL: "#00B2A9", "New Alliance": "#00B2A9",
  PPS: "#B23A48", PARM: "#8D6E63", PDM: "#3E5C76",
  "Liberal Party": "#F4A259", Liberal: "#F4A259", Conservative: "#1E3A8A",
  "Anti-Reelectionist": "#B5651D", "Anti-Reelectionist Party": "#B5651D",
  "Progressive Constitutionalist": "#4E8EC4", "Constitutionalist": "#4E8EC4",
  "National Republican": "#748CAB", "Labour": "#B03060",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function mxPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Revolutionary Institutional|Institutional/i.test(name)) return "#006341";
  if (/Regeneration|Morena/i.test(name)) return "#A6032F";
  if (/National Action/i.test(name)) return "#0059A7";
  if (/Democratic Revolution/i.test(name)) return "#F5C400";
  if (/Green/i.test(name)) return "#4CAF50";
  if (/Liberal/i.test(name)) return "#F4A259";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function mxLegEraOf(key: string) {
  return getMxElections().legEras.find((e) => e.key === key) ?? null;
}
export function mxPresEraOf(key: string) {
  return getMxElections().presEras.find((e) => e.key === key) ?? null;
}
export function mxElectionById(id: string): MxLegElection | MxPresElection | null {
  const f = getMxElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function mxLegNeighbours(id: string): { prev: MxLegElection | null; next: MxLegElection | null } {
  const els = getMxElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function mxPresNeighbours(id: string): { prev: MxPresElection | null; next: MxPresElection | null } {
  const els = getMxElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const mxFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-MX"));
export const mxFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives — computed from the competitive era, where the
// numbers describe real contests rather than arranged outcomes.
export type MxElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeMxRecords(): MxElectionRecord[] {
  const { presidential, legislative } = getMxElections();
  const recs: MxElectionRecord[] = [];
  const modern = presidential.filter((e) => e.year >= 1994);
  const withTurnout = modern.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout (competitive era)", value: mxFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
    recs.push({ label: "Lowest turnout (competitive era)", value: mxFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} presidential election` });
  }
  const modernWinners = modern
    .map((e) => {
      const w = e.candidates.slice().sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (modernWinners.length) {
    const big = modernWinners.reduce((a, b) => ((a.w.r1Share ?? 0) >= (b.w.r1Share ?? 0) ? a : b));
    const close = modernWinners.reduce((a, b) => ((a.w.r1Share ?? 100) <= (b.w.r1Share ?? 100) ? a : b));
    recs.push({ label: "Biggest competitive-era win", value: mxFmtPct(big.w.r1Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    recs.push({ label: "Narrowest winning share", value: mxFmtPct(close.w.r1Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  recs.push({ label: "Years of unbroken official-party rule", value: "71", electionId: "pres-2000", detail: "1929–2000, ended by Vicente Fox's victory" });
  const plural = legislative.filter((e) => e.year >= 1997);
  if (plural.length) {
    recs.push({ label: "Midterms since the Chamber turned plural", value: String(plural.length), electionId: "1997", detail: "every one since 1997 a real contest for the majority" });
  }
  return recs;
}
