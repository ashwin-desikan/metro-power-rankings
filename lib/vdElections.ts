import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type VdElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type VdLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: VdElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type VdPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type VdPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: VdPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type VdElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: VdPresElection[];
  legislative: VdLegElection[];
};

// ---------------- loader ----------------
let _core: VdElectionsFile | null = null;
export function getVdElections(): VdElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "vd-elections.json"), "utf-8"),
  ) as VdElectionsFile);
}

// ---------------- party colors ----------------
// Conventional South Vietnamese party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "National Revolutionary Movement": "#B8860B",
  "Pro-government Independents": "#D4AF37",
  "Pro-government independents": "#D4AF37",
  "Opposition independents": "#9ca3af",
  "Independents": "#9ca3af",
  "Citizens' Assembly": "#6A8CAF",
  "Movement to Win and Preserve Freedom": "#8B6C42",
  "Dai-Viet Progressive Party": "#2E7D32",
  "Đại Việt Progressive Party": "#2E7D32",
  "Dai Viet Progressive Party": "#2E7D32",
  "Việt Nam Quốc Dân Đảng": "#1565C0",
  "Personalist Labor Revolutionary Party": "#B8860B",
};
export function vdPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function vdLegEraOf(key: string) {
  return getVdElections().legEras.find((e) => e.key === key) ?? null;
}
export function vdPresEraOf(key: string) {
  return getVdElections().presEras.find((e) => e.key === key) ?? null;
}
export function vdElectionById(id: string): VdLegElection | VdPresElection | null {
  const f = getVdElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function vdLegNeighbours(id: string): { prev: VdLegElection | null; next: VdLegElection | null } {
  const els = getVdElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function vdPresNeighbours(id: string): { prev: VdPresElection | null; next: VdPresElection | null } {
  const els = getVdElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const vdFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const vdFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type VdElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeVdRecords(): VdElectionRecord[] {
  const recs: VdElectionRecord[] = [];
  const pres = getVdElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: vdFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: vdFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: VdPresElection; w: VdPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: vdFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: vdFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getVdElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: vdFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: vdFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: vdFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: vdFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  return recs;
}
