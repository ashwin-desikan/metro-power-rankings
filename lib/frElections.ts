import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type FrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null;
};
export type FrLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null; // percent, first round where two were held
  parties: FrElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
};
export type FrPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type FrPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null; // first round
  turnout2: number | null; // second round
  candidates: FrPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
};
export type FrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legislative: FrLegElection[];
  presidential: FrPresElection[];
};

// ---------------- loader ----------------
let _core: FrElectionsFile | null = null;
export function getFrElections(): FrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "fr-elections.json"), "utf-8"),
  ) as FrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional French political colors across the regimes; names always
// accompany the color.
const P: Record<string, string> = {
  NFP: "#D62839", NUPES: "#D62839", "Popular Front": "#D62839",
  PS: "#E75480", SFIO: "#E75480", Socialist: "#E75480", "Socialist Party": "#E75480",
  PCF: "#C1121F", Communist: "#C1121F", "French Communist Party": "#C1121F",
  LFI: "#CC2936", "La France Insoumise": "#CC2936",
  Ensemble: "#FFB400", LREM: "#FFB400", RE: "#FFB400", "La République En Marche!": "#FFB400", Renaissance: "#FFB400",
  MoDem: "#FF8C42", UDF: "#FF8C42", "Union for French Democracy": "#FF8C42", MRP: "#FF8C42",
  "RN/UXD": "#1D3461", RN: "#1D3461", FN: "#1D3461", "National Rally": "#1D3461", "National Front": "#1D3461",
  Reconquête: "#40356F",
  LR: "#2364AA", UMP: "#2364AA", RPR: "#2364AA", "The Republicans": "#2364AA", "Rally for the Republic": "#2364AA",
  UNR: "#3A5BA0", UDR: "#3A5BA0", "Union for the New Republic": "#3A5BA0", Gaullist: "#3A5BA0",
  RPF: "#3A5BA0", "Union of Democrats for the Republic": "#3A5BA0",
  FGDS: "#E75480", "Federation of the Democratic and Socialist Left": "#E75480",
  RI: "#4E8EC4", "Independent Republicans": "#4E8EC4", CNIP: "#4E8EC4", "National Centre of Independents and Peasants": "#4E8EC4",
  Radical: "#F4A259", "Radical Party": "#F4A259", "Radical-Socialist": "#F4A259", RAD: "#F4A259",
  Republican: "#4361EE", "Moderate Republican": "#4361EE", Opportunist: "#4361EE", "Republican Union": "#4361EE",
  "Democratic Republican Alliance": "#5B8DEF", ARD: "#5B8DEF",
  Monarchist: "#7B3F00", Legitimist: "#5A189A", Legitimists: "#5A189A",
  Orléanist: "#8E6C88", Bonapartist: "#8E7CC3", "Ultra-royalist": "#5A189A", Ultras: "#5A189A",
  Conservative: "#1E3A8A", "Conservative Right": "#1E3A8A",
  Liberal: "#F9C74F", Doctrinaires: "#F9C74F", Movement: "#F4A259", Resistance: "#365C8D",
  Girondins: "#4895EF", Montagnards: "#B23A48", "The Mountain": "#B23A48", "The Plain": "#8A8F98", Marais: "#8A8F98",
  Jacobin: "#B23A48", Feuillants: "#5B8DEF", Thermidorians: "#748CAB",
  Royalist: "#7B3F00", Royalists: "#7B3F00",
  Green: "#3D9B35", "The Greens": "#3D9B35", EELV: "#3D9B35", Ecologist: "#3D9B35",
  DVD: "#7A9CC9", DVG: "#E8909C", Miscellaneous: "#8a8f98",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function frPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Socialist/i.test(name)) return "#E75480";
  if (/Communist/i.test(name)) return "#C1121F";
  if (/National (Rally|Front)|RN/.test(name)) return "#1D3461";
  if (/Gaullist|New Republic/i.test(name)) return "#3A5BA0";
  if (/Radical/i.test(name)) return "#F4A259";
  if (/Republic/i.test(name)) return "#4361EE";
  if (/Royalist|Legitimist|Ultra/i.test(name)) return "#5A189A";
  if (/Monarch|Orléan/i.test(name)) return "#7B3F00";
  if (/Green|Ecolog/i.test(name)) return "#3D9B35";
  if (/Liberal/i.test(name)) return "#F9C74F";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function frLegEraOf(key: string) {
  return getFrElections().legEras.find((e) => e.key === key) ?? null;
}
export function frPresEraOf(key: string) {
  return getFrElections().presEras.find((e) => e.key === key) ?? null;
}
export function frElectionById(id: string): FrLegElection | FrPresElection | null {
  const f = getFrElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function frLegNeighbours(id: string): { prev: FrLegElection | null; next: FrLegElection | null } {
  const els = getFrElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function frPresNeighbours(id: string): { prev: FrPresElection | null; next: FrPresElection | null } {
  const els = getFrElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const frFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR"));
export const frFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset.
export type FrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeFrRecords(): FrElectionRecord[] {
  const { legislative, presidential } = getFrElections();
  const recs: FrElectionRecord[] = [];
  const withTurnout = legislative.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest legislative turnout", value: frFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} legislative election` });
    recs.push({ label: "Lowest legislative turnout", value: frFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} legislative election` });
  }
  const direct = presidential.filter((e) => e.year >= 1965);
  const runoffs = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r2Share != null);
  if (runoffs.length) {
    const big = runoffs.reduce((a, b) => ((a.c.r2Share ?? 0) >= (b.c.r2Share ?? 0) ? a : b));
    recs.push({ label: "Biggest runoff win", value: frFmtPct(big.c.r2Share), electionId: big.e.id, detail: `${big.c.name}, ${big.e.label}` });
    const winners = direct
      .map((e) => {
        const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
        return w ? { e, w } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (winners.length) {
      const closest = winners.reduce((a, b) => ((a.w.r2Share ?? 100) <= (b.w.r2Share ?? 100) ? a : b));
      recs.push({ label: "Closest runoff", value: frFmtPct(closest.w.r2Share), electionId: closest.e.id, detail: `${closest.w.name}, ${closest.e.label}` });
    }
    const presTurnout = direct.filter((e) => e.turnout != null);
    if (presTurnout.length) {
      const phi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
      recs.push({ label: "Highest presidential turnout", value: frFmtPct(phi.turnout), electionId: phi.id, detail: `${phi.label} presidential election, first round` });
    }
  }
  const withSeats = legislative
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null && x.e.totalSeats != null);
  if (withSeats.length) {
    const shareOf = (x: { e: FrLegElection; p: FrElectionParty }) => (x.p.seats ?? 0) / (x.e.totalSeats ?? 1);
    const sweep = withSeats.reduce((a, b) => (shareOf(a) >= shareOf(b) ? a : b));
    recs.push({
      label: "Biggest share of the chamber", value: `${(shareOf(sweep) * 100).toFixed(1)}%`, electionId: sweep.e.id,
      detail: `${sweep.p.name}, ${sweep.e.label}: ${sweep.p.seats} of ${sweep.e.totalSeats} seats`,
    });
  }
  return recs;
}
