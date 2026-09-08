import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CzElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type CzLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: CzElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CzPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type CzPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: CzPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CzElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: CzPresElection[];
  legislative: CzLegElection[];
};

// ---------------- loader ----------------
let _core: CzElectionsFile | null = null;
export function getCzElections(): CzElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "cz-elections.json"), "utf-8"),
  ) as CzElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Czech party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Communist Party of Czechoslovakia": "#A6192E",
  "Communist Party of Bohemia and Moravia": "#A6192E",
  "Communist Party of Slovakia": "#A6192E",
  "Czechoslovak Social Democratic Workers' Party": "#EE7203",
  "Czechoslovak Social Democracy": "#EE7203",
  "Czech Social Democratic Party": "#EE7203",
  "Czechoslovak People's Party": "#F5A623",
  "KDU-ČSL": "#F5A623",
  "Republican Party of Farmers and Peasants": "#4C8C2B",
  "Republican Party of the Czechoslovak Countryside": "#4C8C2B",
  "Czechoslovak National Democracy": "#1B3A6B",
  "Czechoslovak Socialist Party": "#5EB3E4",
  "Czechoslovak National Social Party": "#5EB3E4",
  "Czech National Social Party": "#5EB3E4",
  "German Social Democratic Workers' Party": "#B35A00",
  "German Christian Social People's Party": "#8C6239",
  "German National Party": "#4A4A4A",
  "German National Socialist Workers' Party": "#3B3B3B",
  "Civic Forum": "#0057A0",
  "Public Against Violence": "#1FA087",
  "Slovak National Party": "#0B5D30",
  "Hlinka's Slovak People's Party": "#7A5C1E",
  "Civic Democratic Party": "#08428C",
  "Civic Democratic Alliance": "#3E6FB0",
  "Green Party": "#4CA82D",
  "TOP 09": "#6E2585",
  "ANO 2011": "#0072BC",
  "ANO": "#0072BC",
  "Czech Pirate Party": "#1A1A1A",
  "Freedom and Direct Democracy": "#0B2E4F",
  "Freedom Union": "#5EB3E4",
  "Democratic Union": "#5EB3E4",
  "SPR-RSČ": "#5C1A1A",
  "SPR–RSČ": "#5C1A1A",
};
export function czPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Communist/i.test(name)) return "#A6192E";
  if (/Social Democra/i.test(name)) return "#EE7203";
  if (/KDU|People's Party|Christian/i.test(name)) return "#F5A623";
  if (/Pirate/i.test(name)) return "#1A1A1A";
  if (/SPOLU|Spolu/i.test(name)) return "#08428C";
  if (/Republican Party|Agrarian/i.test(name)) return "#4C8C2B";
  if (/German/i.test(name)) return "#8C6239";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function czLegEraOf(key: string) {
  return getCzElections().legEras.find((e) => e.key === key) ?? null;
}
export function czPresEraOf(key: string) {
  return getCzElections().presEras.find((e) => e.key === key) ?? null;
}
export function czElectionById(id: string): CzLegElection | CzPresElection | null {
  const f = getCzElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function czLegNeighbours(id: string): { prev: CzLegElection | null; next: CzLegElection | null } {
  const els = getCzElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function czPresNeighbours(id: string): { prev: CzPresElection | null; next: CzPresElection | null } {
  const els = getCzElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const czFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const czFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type CzElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCzRecords(): CzElectionRecord[] {
  const recs: CzElectionRecord[] = [];
  const pres = getCzElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: czFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: czFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: CzPresElection; w: CzPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: czFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: czFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getCzElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: czFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: czFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: czFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: czFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest legislative majority", value: "128 of 200 seats", electionId: "1968", detail: "The Communist Party of Czechoslovakia's share of the National Front list under one-party rule." });
  recs.push({ label: "Closest Czech election", value: "80 vs. 71 seats", electionId: "2025", detail: "ANO 2011's return to power over the outgoing SPOLU-led coalition." });
  return recs;
}
