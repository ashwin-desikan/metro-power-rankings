import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type AtElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type AtLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: AtElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type AtPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type AtPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: AtPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type AtElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: AtPresElection[];
  legislative: AtLegElection[];
};

// ---------------- loader ----------------
let _core: AtElectionsFile | null = null;
export function getAtElections(): AtElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "at-elections.json"), "utf-8"),
  ) as AtElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Austriaian party colors; names always accompany the color.
const P: Record<string, string> = {
  "Austrian People's Party": "#63C3D0",
  "ÖVP": "#63C3D0",
  "Social Democratic Party of Austria": "#CE000C",
  "Socialist Party of Austria": "#CE000C",
  "Social Democratic Workers' Party": "#CE000C",
  "SPÖ": "#CE000C",
  "Freedom Party of Austria": "#0056A2",
  "FPÖ": "#0056A2",
  "The Greens": "#88B626",
  "Greens": "#88B626",
  "United Greens of Austria": "#88B626",
  "NEOS": "#E84188",
  "Liberal Forum": "#E84188",
  "Alliance for the Future of Austria": "#F5A623",
  "Peter Pilz List": "#C6C6C6",
  "Communist Party of Austria": "#A61C1C",
  "Christian Social Party": "#3B7DAD",
  "Landbund": "#7B6D4E",
  "Greater German People's Party": "#5D4037",
  "Beer Party": "#C69C33",
  "Team Stronach": "#8D6E63",
  // Imperial Council clubs, 1897-1911. The Reichsrat organised by club rather
  // than by party, and the clubs were national before they were ideological, so
  // these follow the successor party where there is one and the nationality
  // where there is not.
  "Christian Social Union": "#63C3D0",
  "Club of German Social Democrats": "#CE000C",
  "Club of Bohemian Social Democrats": "#E05A5A",
  "Club of Polish Social Democrats": "#E88A8A",
  "Association of Social Democrats": "#CE000C",
  "Social Democratic Association": "#CE000C",
  "Group of Italian Social Democrats": "#E05A5A",
  "Deutscher Nationalverband": "#5D4037",
  "German National Association": "#5D4037",
  "Association of German People's Parties": "#6D4C41",
  "German Progressive Union": "#8D6E63",
  "German Progressive Parties": "#8D6E63",
  "Free German Union": "#8D6E63",
  "German Radical Group": "#4E342E",
  "German Agrarian Parties": "#A1887F",
  "Pan-German Group": "#3E2723",
  "Free Association of Pan-Germans": "#3E2723",
  "Poland Club": "#B0578D",
  "Polish People's Party": "#C77BA6",
  "Polish People's Parties": "#C77BA6",
  "Polish Christian People's Parties": "#C77BA6",
  "Bohemian Club": "#6A8E4E",
  "Uniform Bohemian Club": "#6A8E4E",
  "Union of Unaligned Bohemians": "#8AA96E",
  "Club of Bohemian Agrarians": "#8AA96E",
  "Bohemian National Social Club": "#A8C48C",
  "Group of Bohemian Conservative Landowners": "#4F6B39",
  "Ruthenian Club": "#F4A259",
  "Ukrainian Association": "#F4A259",
  "Representation of Ruthenian-Ukrainian Social Democrats": "#F7BE8A",
  "Italian Union": "#2E8B57",
  "Latin Union": "#2E8B57",
  "Club of Liberal Italians": "#57A87A",
  "Italian People's Party": "#57A87A",
  "Slovenian Club": "#4E8EC4",
  "Slavic Association": "#4E8EC4",
  "Slavic Christian-National Association": "#4E8EC4",
  "Association of Yugoslavians": "#3C7AB0",
  "Yugoslavian Progressive Club": "#3C7AB0",
  "Croatian-Slovenian Club": "#3C7AB0",
  "Dalmatian Club": "#7FB3D5",
  "Romanian Club": "#B39DDB",
  "Jewish Club": "#7E57C2",
  "Centre Club": "#90A4AE",
  "Center Club": "#90A4AE",
  "Club of Catholic People's Parties": "#78909C",
  "Catholic-National Party": "#78909C",
  "Union of Constitutionalist Landowners": "#607D8B",
  "Union of Constitutional Landowners": "#607D8B",
  "Moravian Center Parties": "#B0BEC5",
  "Independents": "#9ca3af",
  "Others": "#9ca3af",
};
export function atPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function atLegEraOf(key: string) {
  return getAtElections().legEras.find((e) => e.key === key) ?? null;
}
export function atPresEraOf(key: string) {
  return getAtElections().presEras.find((e) => e.key === key) ?? null;
}
export function atElectionById(id: string): AtLegElection | AtPresElection | null {
  const f = getAtElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function atLegNeighbours(id: string): { prev: AtLegElection | null; next: AtLegElection | null } {
  const els = getAtElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function atPresNeighbours(id: string): { prev: AtPresElection | null; next: AtPresElection | null } {
  const els = getAtElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const atFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("de-AT"));
export const atFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows
// this atlas labels unfree, are excluded where including them would flatter
// the number rather than explain it.
export type AtElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeAtRecords(): AtElectionRecord[] {
  const { presidential } = getAtElections();
  const recs: AtElectionRecord[] = [];
  const direct = presidential.filter((e) => (e.year >= 1945 && e.year <= 1960) || e.year >= 1989);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: atFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  const runoffs = presidential
    .filter((e) => e.year >= 1989)
    .map((e) => {
      const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (runoffs.length) {
    const close = runoffs.reduce((a, b) => ((a.w.r2Share ?? 100) <= (b.w.r2Share ?? 100) ? a : b));
    const big = runoffs.reduce((a, b) => ((a.w.r2Share ?? 0) >= (b.w.r2Share ?? 0) ? a : b));
    recs.push({ label: "Closest runoff", value: atFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
    recs.push({ label: "Biggest runoff win", value: atFmtPct(big.w.r2Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const r1 = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r1Votes != null);
  if (r1.length) {
    const most = r1.reduce((a, b) => ((a.c.r1Votes ?? 0) >= (b.c.r1Votes ?? 0) ? a : b));
    recs.push({ label: "Most first-round votes", value: atFmtInt(most.c.r1Votes), electionId: most.e.id, detail: `${most.c.name}, ${most.e.label}` });
  }
  recs.push({ label: "Workers' Party runoff appearances", value: String(presidential.filter((e) => e.year >= 1989 && e.candidates.some((c) => c.r2Share != null && /PT|Workers/.test(c.party ?? ""))).length), electionId: "pres-2002", detail: "every runoff since redemocratisation has featured the PT" });
  return recs;
}
