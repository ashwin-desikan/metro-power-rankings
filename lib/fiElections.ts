import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type FiElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type FiLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: FiElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type FiPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type FiPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: FiPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type FiElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: FiPresElection[];
  legislative: FiLegElection[];
};

// ---------------- loader ----------------
let _core: FiElectionsFile | null = null;
export function getFiElections(): FiElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "fi-elections.json"), "utf-8"),
  ) as FiElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Finnish party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Social Democratic Party": "#E10600",
  "National Coalition Party": "#0060A9",
  "Agrarian League": "#00923F",
  "Centre Party": "#00923F",
  "Finns Party": "#003580",
  "Finnish Rural Party": "#003580",
  "Left Alliance": "#A6192E",
  "Finnish People's Democratic League": "#A6192E",
  "Communist Party": "#A6192E",
  "Communist Workers' Party": "#A6192E",
  "Communist Workers' Party – For Peace and Socialism": "#A6192E",
  "Green League": "#62A925",
  "Greens": "#62A925",
  "Ecological Party the Greens": "#62A925",
  "Swedish People's Party": "#FDB913",
  "Christian Democrats": "#00A9CE",
  "Finnish Christian League": "#00A9CE",
  "National Progressive Party": "#5BC2E7",
  "Liberal People's Party": "#5BC2E7",
  "Liberal League": "#5BC2E7",
  "Liberals": "#5BC2E7",
  "Finnish Party": "#7B3F00",
  "Young Finnish Party": "#C08552",
  "Patriotic People's Movement": "#4B4B4B",
  "Christian Workers' Union": "#C97586",
  "People's Party": "#9CA3AF",
  "Independents": "#9CA3AF",
  "Independent": "#9CA3AF",
  "Others": "#9CA3AF",
  "Movement Now": "#FF8200",
  "Pirate Party": "#4C1E63",
  "Small Farmers' Party": "#8A9A5B",
  "Small Farmers Party": "#8A9A5B",
  "Åland Coalition": "#FDB913",
};
export function fiPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Social Democrat/i.test(name)) return "#E10600";
  if (/National Coalition/i.test(name)) return "#0060A9";
  if (/Centre Party|Agrarian/i.test(name)) return "#00923F";
  if (/Finns Party|Rural Party/i.test(name)) return "#003580";
  if (/Left Alliance|People's Democratic League|Communist/i.test(name)) return "#A6192E";
  if (/Green/i.test(name)) return "#62A925";
  if (/Swedish People's Party/i.test(name)) return "#FDB913";
  if (/Christian/i.test(name)) return "#00A9CE";
  if (/Progressive|Liberal/i.test(name)) return "#5BC2E7";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function fiLegEraOf(key: string) {
  return getFiElections().legEras.find((e) => e.key === key) ?? null;
}
export function fiPresEraOf(key: string) {
  return getFiElections().presEras.find((e) => e.key === key) ?? null;
}
export function fiElectionById(id: string): FiLegElection | FiPresElection | null {
  const f = getFiElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function fiLegNeighbours(id: string): { prev: FiLegElection | null; next: FiLegElection | null } {
  const els = getFiElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function fiPresNeighbours(id: string): { prev: FiPresElection | null; next: FiPresElection | null } {
  const els = getFiElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const fiFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const fiFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type FiElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeFiRecords(): FiElectionRecord[] {
  const recs: FiElectionRecord[] = [];
  const pres = getFiElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: fiFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: fiFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: FiPresElection; w: FiPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: fiFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: fiFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getFiElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: fiFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: fiFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: fiFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: fiFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest seat total on record", value: "103 of 200 seats", electionId: "1916", detail: "The only time a single party has held an outright Eduskunta majority; the Social Democrats lost it when parliament was dissolved and re-elected in October 1917." });
  recs.push({ label: "Closest three-way finish", value: "48-46-43 seats", electionId: "2023", detail: "The National Coalition Party finished first over the Finns Party and the governing Social Democrats by a margin of a few points each way." });
  return recs;
}
