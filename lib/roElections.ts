import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type RoElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type RoLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: RoElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type RoPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type RoPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: RoPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type RoElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: RoPresElection[];
  legislative: RoLegElection[];
};

// ---------------- loader ----------------
let _core: RoElectionsFile | null = null;
export function getRoElections(): RoElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ro-elections.json"), "utf-8"),
  ) as RoElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Romanian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "National Liberal Party": "#F9A825",
  "National Liberal Party–Brătianu": "#F9A825",
  "Liberal Union–Brătianu": "#F9A825",
  "Conservative Party": "#37474F",
  "Conservative-Democratic Party": "#5C6BC0",
  "National Peasants' Party": "#4C8C2B",
  "National Peasant Party": "#4C8C2B",
  "Peasants' Party": "#4C8C2B",
  "Peasants' Party–Lupu": "#8BC34A",
  "Christian Democratic National Peasants' Party": "#4C8C2B",
  "Bessarabian Peasants' Party": "#7CB342",
  "Transylvanian Peasants' Party": "#7CB342",
  "Peasant Workers' Bloc": "#7CB342",
  "Romanian National Party": "#8E24AA",
  "People's Party": "#1565C0",
  "National-Christian Defense League": "#4A148C",
  "Legion of the Archangel Michael": "#1B1B1B",
  "National Renaissance Front": "#003366",
  "People's Democratic Front": "#A6192E",
  "Romanian Workers Party": "#A6192E",
  "Ploughmen's Front": "#A6192E",
  "Social Democratic Party": "#E30613",
  "Romanian Social Democratic Party": "#E30613",
  "Socialist Party": "#C62828",
  "National Salvation Front": "#E30613",
  "Democratic Alliance of Hungarians in Romania": "#2E7D32",
  "Democratic Union of Hungarians in Romania": "#2E7D32",
  "UDMR": "#2E7D32",
  "Greater Romania Party": "#B8860B",
  "Save Romania Union": "#6A1B9A",
  "USR": "#6A1B9A",
  "Alliance for the Union of Romanians": "#7B1113",
  "AUR": "#7B1113",
  "Ecologist Party of Romania": "#43A047",
  "Green Party": "#2E7D32",
  "Romanian Democratic Convention": "#1B4F91",
  "Independents": "#9E9E9E",
  "Independent": "#9E9E9E",
  "Other parties": "#BDBDBD",
};
export function roPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Union of|Community of|Federation of|Association of|League of|Cultural Union|Forum of|Committee|Bratstvo/i.test(name)) return "#B0BEC5";
  if (/Peasant/i.test(name)) return "#4C8C2B";
  if (/Liberal/i.test(name)) return "#F9A825";
  if (/Social Democrat|Socialist|Workers/i.test(name)) return "#E30613";
  if (/Christian|Conservative/i.test(name)) return "#5C6BC0";
  if (/Magyar|Hungarian/i.test(name)) return "#2E7D32";
  if (/National.*Unity|Nationalist|Legion/i.test(name)) return "#4A148C";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function roLegEraOf(key: string) {
  return getRoElections().legEras.find((e) => e.key === key) ?? null;
}
export function roPresEraOf(key: string) {
  return getRoElections().presEras.find((e) => e.key === key) ?? null;
}
export function roElectionById(id: string): RoLegElection | RoPresElection | null {
  const f = getRoElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function roLegNeighbours(id: string): { prev: RoLegElection | null; next: RoLegElection | null } {
  const els = getRoElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function roPresNeighbours(id: string): { prev: RoPresElection | null; next: RoPresElection | null } {
  const els = getRoElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const roFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const roFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type RoElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeRoRecords(): RoElectionRecord[] {
  const recs: RoElectionRecord[] = [];
  const pres = getRoElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: roFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: roFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: RoPresElection; w: RoPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: roFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: roFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getRoElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: roFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: roFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: roFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: roFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest legislative majority", value: "379 of 414 seats", electionId: "1946", detail: "The Bloc of Democratic Parties and its allies, in the election historians describe as fraudulent." });
  recs.push({ label: "Widest presidential margin", value: "85.07%", electionId: "1990", detail: "Ion Iliescu's win in the first free postwar election, decided in a single round." });
  return recs;
}
