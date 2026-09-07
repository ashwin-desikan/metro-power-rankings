import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CdElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type CdLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: CdElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CdPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type CdPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: CdPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CdElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: CdPresElection[];
  legislative: CdLegElection[];
};

// ---------------- loader ----------------
let _core: CdElectionsFile | null = null;
export function getCdElections(): CdElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "cd-elections.json"), "utf-8"),
  ) as CdElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Congolese party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Popular Movement of the Revolution": "#1B7A3D",
  "Union for Democracy and Social Progress": "#C8102E",
  "People's Party for Reconstruction and Democracy": "#0C4DA2",
  "Movement for the Liberation of the Congo": "#F2A900",
  "Unified Lumumbist Party": "#B71C1C",
  "Union for the Congolese Nation": "#00838F",
  "Social Movement for Renewal": "#6A1B9A",
  "People's Party for Peace and Democracy": "#5D4037",
  "Alliance of the Democratic Forces of Congo": "#0E7C7B",
  "Alliance of Democratic Forces of Congo": "#0E7C7B",
  "Mouvement National Congolais-Lumumba": "#C62828",
  "Mouvement National Congolais-Kalonji": "#EF6C00",
  "ABAKO": "#1565C0",
  "CONAKAT": "#2E7D32",
  "Party of National Unity": "#455A64",
  "Christian Democratic Party": "#1E88E5",
  "Regional parties": "#78909C",
  "Independents": "#9ca3af",
};
export function cdPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Revolution/i.test(name)) return "#1B7A3D";
  if (/Union for Democracy/i.test(name)) return "#C8102E";
  if (/Reconstruction and Democracy/i.test(name)) return "#0C4DA2";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function cdLegEraOf(key: string) {
  return getCdElections().legEras.find((e) => e.key === key) ?? null;
}
export function cdPresEraOf(key: string) {
  return getCdElections().presEras.find((e) => e.key === key) ?? null;
}
export function cdElectionById(id: string): CdLegElection | CdPresElection | null {
  const f = getCdElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function cdLegNeighbours(id: string): { prev: CdLegElection | null; next: CdLegElection | null } {
  const els = getCdElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function cdPresNeighbours(id: string): { prev: CdPresElection | null; next: CdPresElection | null } {
  const els = getCdElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const cdFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-CD"));
export const cdFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows this
// atlas labels unfree, are excluded where including them would flatter the
// number rather than explain it.
export type CdElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCdRecords(): CdElectionRecord[] {
  const { presidential, legislative } = getCdElections();
  const pres = presidential.filter((e) => e.unfree !== "unfree");
  const recs: CdElectionRecord[] = [];
  const withTurnout = pres.filter((e) => e.turnout != null && (e.turnout ?? 0) <= 100);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: cdFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}` });
    recs.push({ label: "Lowest presidential turnout", value: cdFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const decided = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (decided.length) {
    const close = decided.reduce((a, b) => (a.share <= b.share ? a : b));
    recs.push({ label: "Narrowest win", value: cdFmtPct(close.share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  const seated = legislative.filter((e) => e.unfree !== "unfree").flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (seated.length) {
    const haul = seated.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: cdFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Single-list assemblies", value: "5", electionId: "1975", detail: "1970 to 1987, every seat to the Popular Movement of the Revolution" });
  recs.push({ label: "Parties winning seats in 2011", value: "105", electionId: "2011", detail: "the most fragmented national assembly in the atlas" });
  return recs;
}
