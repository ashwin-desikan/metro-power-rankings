import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type PeLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: PeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type PePresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PePresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PePresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type PeElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: PePresElection[];
  legislative: PeLegElection[];
};

// ---------------- loader ----------------
let _core: PeElectionsFile | null = null;
export function getPeElections(): PeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "pe-elections.json"), "utf-8"),
  ) as PeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Peruvian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Popular Force": "#FF6600",
  "Popular Action": "#FF0000",
  "American Popular Revolutionary Alliance": "#FF0000",
  "APRA": "#FF0000",
  "Together for Peru": "#8B0000",
  "Free Peru": "#B22222",
  "Popular Renewal": "#003893",
  "Party of Good Government": "#0033A0",
  "Civic Party OBRAS": "#F7A800",
  "Ahora Nación": "#00838F",
  "Country for All": "#4B0082",
  "Cambio 90": "#2E9E4F",
  "Cambio 90 – New Majority": "#2E9E4F",
  "C90–NM": "#2E9E4F",
  "C90-NM": "#2E9E4F",
  "Peru 2000": "#2E9E4F",
  "Possible Peru": "#00A0DC",
  "Union for Peru": "#8B0000",
  "Peru Wins": "#B22222",
  "National Solidarity": "#003893",
  "Alliance for Progress": "#0033A0",
  "Podemos Perú": "#4169B2",
  "We Are Peru": "#FFD100",
  "Christian People's Party": "#4169B2",
  "Christian Democrat Party": "#00838F",
  "Democratic Convergence": "#4169B2",
  "United Left": "#C8102E",
  "National Front of Workers and Peasants": "#C8102E",
  "Revolutionary Union": "#000080",
  "Concentración Nacional": "#4169B2",
  "National Democratic Front": "#C8102E",
  "Restoration Party": "#003893",
  "Odriist lists": "#003893",
  "Odriist National Union": "#003893",
  "Pradist Democratic Movement": "#4169B2",
  "Constitutional Party": "#4169B2",
  "Democratic Party": "#8B0000",
  "Civilista Party": "#003893",
  "Democratic Front": "#00A0DC",
  "Popular Christian Party": "#4169B2",
  "Alliance for the Future": "#FF6600",
  "Alliance for the Great Change": "#00A0DC",
};
export function pePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function peLegEraOf(key: string) {
  return getPeElections().legEras.find((e) => e.key === key) ?? null;
}
export function pePresEraOf(key: string) {
  return getPeElections().presEras.find((e) => e.key === key) ?? null;
}
export function peElectionById(id: string): PeLegElection | PePresElection | null {
  const f = getPeElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function peLegNeighbours(id: string): { prev: PeLegElection | null; next: PeLegElection | null } {
  const els = getPeElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function pePresNeighbours(id: string): { prev: PePresElection | null; next: PePresElection | null } {
  const els = getPeElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const peFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const peFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type PeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePeRecords(): PeElectionRecord[] {
  const recs: PeElectionRecord[] = [];
  const pres = getPeElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: peFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: peFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: PePresElection; w: PePresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: peFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: peFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getPeElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: peFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: peFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: peFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: peFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  return recs;
}
