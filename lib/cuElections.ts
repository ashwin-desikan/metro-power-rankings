import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CuElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type CuLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: CuElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CuPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type CuPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: CuPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CuElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: CuPresElection[];
  legislative: CuLegElection[];
};

// ---------------- loader ----------------
let _core: CuElectionsFile | null = null;
export function getCuElections(): CuElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "cu-elections.json"), "utf-8"),
  ) as CuElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Cuban party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Liberal Party of Cuba": "#C8102E",
  "Liberal": "#C8102E",
  "Liberal Coalition": "#C8102E",
  "National Liberal Party": "#C8102E",
  "Unionist Liberal Party": "#C8102E",
  "Provincial Liberal Party": "#C8102E",
  "National Conservative Party": "#1B3F8B",
  "PNC": "#1B3F8B",
  "Moderate Party": "#4C6EF5",
  "Republican": "#5C6BC0",
  "Republican Party": "#5C6BC0",
  "Republican Democratic Party": "#5C6BC0",
  "Republican Party of Havana": "#5C6BC0",
  "Federal Republican": "#3949AB",
  "Federal Republican Party": "#3949AB",
  "Partido Auténtico": "#F2A900",
  "Auténtico": "#F2A900",
  "Auténtico–Republican Alliance": "#F2A900",
  "Auténtico-Republican Alliance": "#F2A900",
  "Partido Ortodoxo": "#E8590C",
  "Ortodoxo": "#E8590C",
  "Popular Socialist Party": "#7A1F1F",
  "Democratic Party": "#2E7D32",
  "Democratic-Nationalist Party": "#2E7D32",
  "Progressive Action Party": "#6A0DAD",
  "National Progressive Coalition": "#6A0DAD",
  "Radical Union": "#00838F",
  "Nationalist Union": "#556B2F",
  "Republican Action": "#37474F",
  "Democratic National Association": "#8D6E63",
  "ABC": "#B08D57",
  "Cuban Popular Party": "#00A651",
  "Popular Party": "#00A651",
  "Cuban Unionist Party": "#8E24AA",
  "Partido del Pueblo Libre": "#0E7C7B",
  "Partido Unión Cubana": "#F9A825",
  "Communist Revolutionary Union": "#7A1F1F",
  "Socialist": "#7A1F1F",
  "Tripartite Coalition": "#9E7B3C",
  "Communist Party of Cuba and affiliated (entire list)": "#A6192E",
  "PCC": "#A6192E",
  "Others": "#9ca3af",
  "Independents": "#9ca3af",
};
export function cuPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Liberal/i.test(name)) return "#C8102E";
  if (/National Conservative|\bPNC\b/i.test(name)) return "#1B3F8B";
  if (/Moderate/i.test(name)) return "#4C6EF5";
  if (/Republican Action/i.test(name)) return "#37474F";
  if (/Republic/i.test(name)) return "#5C6BC0";
  if (/Auténtico/i.test(name)) return "#F2A900";
  if (/Ortodoxo/i.test(name)) return "#E8590C";
  if (/Popular Socialist|Communist Revolutionary|Socialist/i.test(name)) return "#7A1F1F";
  if (/Democratic National/i.test(name)) return "#8D6E63";
  if (/Democratic/i.test(name)) return "#2E7D32";
  if (/Progressive Action|National Progressive/i.test(name)) return "#6A0DAD";
  if (/Radical Union/i.test(name)) return "#00838F";
  if (/Nationalist Union/i.test(name)) return "#556B2F";
  if (/Communist Party of Cuba|\bPCC\b/i.test(name)) return "#A6192E";
  if (/Independent/i.test(name)) return "#9ca3af";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function cuLegEraOf(key: string) {
  return getCuElections().legEras.find((e) => e.key === key) ?? null;
}
export function cuPresEraOf(key: string) {
  return getCuElections().presEras.find((e) => e.key === key) ?? null;
}
export function cuElectionById(id: string): CuLegElection | CuPresElection | null {
  const f = getCuElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function cuLegNeighbours(id: string): { prev: CuLegElection | null; next: CuLegElection | null } {
  const els = getCuElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function cuPresNeighbours(id: string): { prev: CuPresElection | null; next: CuPresElection | null } {
  const els = getCuElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const cuFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const cuFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type CuElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCuRecords(): CuElectionRecord[] {
  const recs: CuElectionRecord[] = [];
  const pres = getCuElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: cuFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: cuFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: CuPresElection; w: CuPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: cuFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: cuFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getCuElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: cuFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: cuFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: cuFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: cuFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Widest presidential field", value: "4 candidates", electionId: "1948", detail: "Carlos Prío Socarrás's win over Ricardo Núñez Portuondo, Eduardo Chibás and Juan Marinello, the republic's most contested presidential race." });
  recs.push({ label: "Largest single-party sweep", value: "31 of 32 House seats", electionId: "1905", detail: "The Moderate Party's result in an election a US peace commission later found so tainted by fraud that it suspended the Congress it produced." });
  recs.push({ label: "Longest gap between elections", value: "14 years", electionId: "1959-1976", detail: "No election was held in Cuba between the revolution and the first National Assembly of People's Power." });
  recs.push({ label: "Highest National Assembly turnout", value: "97.64%", electionId: "2003", detail: "Recorded a year after Fidel Castro told voters the Assembly's list was, in his words, unanimous by design." });
  return recs;
}
