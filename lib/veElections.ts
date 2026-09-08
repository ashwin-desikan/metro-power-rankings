import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type VeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type VeLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: VeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type VePresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type VePresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: VePresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type VeElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: VePresElection[];
  legislative: VeLegElection[];
};

// ---------------- loader ----------------
let _core: VeElectionsFile | null = null;
export function getVeElections(): VeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ve-elections.json"), "utf-8"),
  ) as VeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Venezuelan party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Democratic Action": "#000000",
  "AD": "#000000",
  "AD (ad hoc)": "#000000",
  "Democratic Alliance": "#000000",
  "Copei": "#00843D",
  "Communist Party of Venezuela": "#DA291C",
  "PCV": "#DA291C",
  "Democratic Republican Union": "#FFC72C",
  "URD": "#FFC72C",
  "Movement for Socialism": "#F58220",
  "MAS": "#F58220",
  "MAS-MIR": "#F58220",
  "MAS–MIR": "#F58220",
  "Radical Cause": "#C8102E",
  "LCR": "#C8102E",
  "National Convergence": "#4169B2",
  "CVGC": "#4169B2",
  "Convergence": "#4169B2",
  "Fifth Republic Movement": "#CC0000",
  "MVR": "#CC0000",
  "United Socialist Party of Venezuela": "#B00000",
  "PSUV": "#B00000",
  "Great Patriotic Pole": "#B00000",
  "GPPSB": "#B00000",
  "Justice First": "#003DA5",
  "PJ": "#003DA5",
  "A New Era": "#F7941D",
  "UNT": "#F7941D",
  "Un Nuevo Tiempo": "#F7941D",
  "UNT–UNICA": "#F7941D",
  "Popular Will": "#FFD100",
  "Project Venezuela": "#4682B4",
  "PROVE": "#4682B4",
  "Fatherland for All": "#FDB913",
  "PPT": "#FDB913",
  "Democratic Unity Roundtable": "#4A90D9",
  "MUD": "#4A90D9",
  "Unitary Platform": "#4A90D9",
  "PUD": "#4A90D9",
  "New Democratic Generation": "#8D6E63",
  "People's Electoral Movement": "#7B1FA2",
  "MEP": "#7B1FA2",
  "Authentic Renewal Organization": "#5D4037",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
};
export function vePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function veLegEraOf(key: string) {
  return getVeElections().legEras.find((e) => e.key === key) ?? null;
}
export function vePresEraOf(key: string) {
  return getVeElections().presEras.find((e) => e.key === key) ?? null;
}
export function veElectionById(id: string): VeLegElection | VePresElection | null {
  const f = getVeElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function veLegNeighbours(id: string): { prev: VeLegElection | null; next: VeLegElection | null } {
  const els = getVeElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function vePresNeighbours(id: string): { prev: VePresElection | null; next: VePresElection | null } {
  const els = getVeElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const veFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const veFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type VeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeVeRecords(): VeElectionRecord[] {
  const recs: VeElectionRecord[] = [];
  const pres = getVeElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: veFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: veFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: VePresElection; w: VePresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: veFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: veFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getVeElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: veFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: veFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: veFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: veFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  return recs;
}
