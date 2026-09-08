import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type SkElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type SkLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: SkElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type SkPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type SkPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: SkPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type SkElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: SkPresElection[];
  legislative: SkLegElection[];
};

// ---------------- loader ----------------
let _core: SkElectionsFile | null = null;
export function getSkElections(): SkElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "sk-elections.json"), "utf-8"),
  ) as SkElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Slovak party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Hlinka's Slovak People's Party": "#4B5320",
  "Republican Party of Farmers and Peasants": "#7CB342",
  "Communist Party of Czechoslovakia": "#C8102E",
  "Czechoslovak Social Democratic Workers' Party": "#E4572E",
  "Czechoslovak People's Party": "#1565C0",
  "Czechoslovak National Socialist Party": "#1976D2",
  "Slovak National Party": "#0B3D91",
  "Czechoslovak Traders' Party": "#8D6E63",
  "Independents": "#9ca3af",
  "Independents and others": "#9ca3af",
  "Democratic Party": "#1565C0",
  "Communist Party of Slovakia": "#C8102E",
  "National Front": "#C8102E",
  "Freedom Party": "#8D6E63",
  "Party of Slovak Revival": "#8D6E63",
  "Christian Democratic Movement": "#F5A200",
  "Green Party": "#4CAF50",
  "Social Democracy": "#E4572E",
  "Movement for a Democratic Slovakia": "#1B5E20",
  "People's Party – Movement for a Democratic Slovakia": "#1B5E20",
  "Party of the Democratic Left": "#E4572E",
  "Roma Civic Initiative": "#6A1B9A",
  "Slovak People's Party": "#4B5320",
  "Union of the Workers of Slovakia": "#B71C1C",
  "Party of the Hungarian Coalition": "#1E88A8",
  "Party of the Hungarian Community": "#1E88A8",
  "Slovak National Unity": "#4B5320",
  "B–Revolutionary Workers' Party": "#B71C1C",
  "Alliance of the New Citizen": "#2196F3",
  "Movement for Democracy": "#66BB6A",
  "Civic Conservative Party": "#37474F",
  "Left Bloc": "#C62828",
  "Direction – Social Democracy": "#DA251C",
  "Slovak Democratic and Christian Union – Democratic Party": "#003DA5",
  "Free Forum": "#26A69A",
  "Freedom and Solidarity": "#FFE000",
  "Most–Híd": "#7B3F98",
  "People's Party Our Slovakia": "#7A0C0C",
  "99% – Civic Voice": "#78909C",
  "We Are Family": "#F58220",
  "Slovak Revival Movement": "#689F38",
  "Progressive Slovakia": "#A346FF",
  "Voice – Social Democracy": "#00A19A",
  "Party of Civic Understanding": "#FFA000",
  "Public Against Violence": "#4CAF93",
  "Independent": "#9ca3af",
};
export function skPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Hlinka|Slovak People's Party/i.test(name)) return "#4B5320";
  if (/Kotleb|People's Party Our Slovakia/i.test(name)) return "#7A0C0C";
  if (/Communist/i.test(name)) return "#C8102E";
  if (/Direction|Smer/i.test(name)) return "#DA251C";
  if (/Hungarian/i.test(name)) return "#1E88A8";
  if (/Movement for a Democratic Slovakia|HZDS/i.test(name)) return "#1B5E20";
  if (/Christian Democratic/i.test(name)) return "#F5A200";
  if (/Democratic and Christian Union/i.test(name)) return "#003DA5";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function skLegEraOf(key: string) {
  return getSkElections().legEras.find((e) => e.key === key) ?? null;
}
export function skPresEraOf(key: string) {
  return getSkElections().presEras.find((e) => e.key === key) ?? null;
}
export function skElectionById(id: string): SkLegElection | SkPresElection | null {
  const f = getSkElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function skLegNeighbours(id: string): { prev: SkLegElection | null; next: SkLegElection | null } {
  const els = getSkElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function skPresNeighbours(id: string): { prev: SkPresElection | null; next: SkPresElection | null } {
  const els = getSkElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const skFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const skFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type SkElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeSkRecords(): SkElectionRecord[] {
  const recs: SkElectionRecord[] = [];
  const pres = getSkElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: skFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: skFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: SkPresElection; w: SkPresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: skFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: skFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getSkElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: skFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: skFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: skFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: skFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest legislative majority", value: "83 of 150 seats", electionId: "2012", detail: "Direction-Social Democracy under Robert Fico, the only outright National Council majority since independence." });
  recs.push({ label: "Lowest legislative turnout", value: "54.67%", electionId: "2006", detail: "The freest era's quietest election." });
  recs.push({ label: "Closest presidential runoff", value: "53.12% to 46.88%", electionId: "pres-2024", detail: "Peter Pellegrini's win over Ivan Korčok." });
  return recs;
}
