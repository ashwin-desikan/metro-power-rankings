import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type UsCandidate = {
  party: string | null;
  name: string;
  vp: string | null;
  votes: number | null;
  share: number | null; // percent of popular vote
  ev: number | null;    // electoral votes
};
export type UsElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  turnout: number | null;  // percent of eligible voters (long-run series)
  vapPct: number | null;   // % of voting-age population, 1932+
  vepPct: number | null;   // % of voting-eligible population, 1980+
  ballots: number | null;
  evTotal: number;
  majorityEv: number;
  candidates: UsCandidate[];
  winner: { name: string; party: string | null };
  popularLeader: string | null;
  inversion: boolean;   // popular-vote leader lost the Electoral College
  houseDecided: boolean; // 1800, 1824
  knownAs: string | null;
  summary: string;
};
export type UsElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: UsElection[];
};
export type UsElectionTrends = {
  turnout: { id: string; turnout: number; vapPct: number | null; vepPct: number | null }[];
  twoParty: { id: string; share: number }[];
  thirdParty: { id: string; share: number; name: string | null; party: string | null }[];
  evAmplifier: { id: string; pvPct: number; evPct: number; name: string }[];
};
export type UsCongress = {
  n: number;
  years: string;
  partyA: string; // first party column label for this era (Democratic from 1857)
  partyB: string;
  senate: { total: number; a: number; b: number; others: number; vac: number };
  house: { total: number; a: number; b: number; others: number; vac: number };
  president: string | null;
  trifecta: string | null;
};
export type UsMidterm = {
  year: number;
  congress: number;
  president: string | null;
  presParty: string;
  houseChange: number;
  senateChange: number;
  houseFlip: boolean;
  senateFlip: boolean;
  houseAfter: { dem: number; rep: number };
  senateAfter: { dem: number; rep: number };
};
export type UsCongressFile = {
  note: string;
  congresses: UsCongress[];
  midterms: { note: string; list: UsMidterm[] };
};
// state-level results: r rows are [electoralVotes, votes, pct] per candidate
export type UsStateResults = {
  candidates: { name: string; party: string | null }[];
  states: { state: string; r: [number | null, number | null, number | null][] }[];
  reconciliation?: { name: string; tableEv: number; officialEv: number }[];
};

// ---------------- loaders ----------------
function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf-8")) as T;
}
let _core: UsElectionsFile | null = null;
let _trends: UsElectionTrends | null = null;
let _congress: UsCongressFile | null = null;
export function getUsElections(): UsElectionsFile {
  return (_core ??= readJson<UsElectionsFile>("us-elections.json"));
}
export function getUsElectionTrends(): UsElectionTrends {
  return (_trends ??= readJson<UsElectionTrends>("us-elections-trends.json"));
}
export function getUsCongress(): UsCongressFile {
  return (_congress ??= readJson<UsCongressFile>("us-elections-congress.json"));
}
let _states: Record<string, UsStateResults> | null = null;
export function getUsStateResults(id: string): UsStateResults | null {
  _states ??= readJson<Record<string, UsStateResults>>("us-elections-states.json");
  return _states[id] ?? null;
}
// states carried per candidate name (state won = most electoral votes in it)
export function statesCarried(id: string): Record<string, number> {
  const d = getUsStateResults(id);
  const out: Record<string, number> = {};
  if (!d) return out;
  for (const s of d.states) {
    let wi = -1, best = 0;
    d.candidates.forEach((_, i) => {
      const ev = s.r[i]?.[0] ?? 0;
      if (ev !== null && ev > best) { best = ev; wi = i; }
    });
    if (wi >= 0) out[d.candidates[wi].name] = (out[d.candidates[wi].name] ?? 0) + 1;
  }
  return out;
}

// ---------------- party colors ----------------
// Conventional US party colors; names always accompany the color.
const P: Record<string, string> = {
  Democratic: "#3B7DD8", Republican: "#D93A3F",
  "Democratic-Republican": "#2E8B57", Federalist: "#EA9978",
  "Pro-Administration": "#EA9978", "Anti-Administration": "#2E8B57",
  Independent: "#8a8f98", Whig: "#F0C862", "National Republican": "#E39B45",
  "National Union": "#D93A3F", "Anti-Masonic": "#B03060", Nullifier: "#7A5C61",
  "Democratic (Southern)": "#7A9CC6", "Southern Democratic": "#7A9CC6",
  "Democratic (Northern)": "#3B7DD8", "Constitutional Union": "#5FA777",
  "Liberal Republican": "#C08552", "Straight-Out Democrats": "#7A9CC6",
  Populist: "#ACB334", "Democratic/Populist": "#3B7DD8", Progressive: "#FF6347",
  "Progressive Party (United States, 1912–1920)": "#FF6347",
  "Progressive Party (United States, 1924)": "#FF6347",
  Socialist: "#D53E4F", "Social Democratic": "#D53E4F", "Socialist Labor": "#B22222",
  "Socialist Workers": "#B22222", Communist: "#8B0000", Prohibition: "#8A2BE2",
  Dixiecrat: "#E8B23F", "American Independent": "#808000", American: "#7B3F00",
  "Know Nothing": "#7B3F00", "Free Soil": "#996515", Liberty: "#996515",
  Greenback: "#3E8E41", Libertarian: "#C9A227", Green: "#17AA5C", Reform: "#6A0DAD",
  Union: "#5FA777", "New Alliance": "#9370DB", Citizens: "#9370DB",
  "Natural Law": "#87CEEB", Constitution: "#5D3A9B", Jacksonian: "#3B7DD8",
  "Anti-Jacksonian": "#E39B45", Opposition: "#E39B45",
};
export function usPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  if (P[name]) return P[name];
  const base = name.split("(")[0].trim();
  if (P[base]) return P[base];
  if (name.startsWith("Democratic")) return P.Democratic;
  if (name.startsWith("Republican")) return P.Republican;
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function usEraOf(key: string) {
  return getUsElections().eras.find((e) => e.key === key) ?? null;
}
export function usElectionById(id: string): UsElection | null {
  return getUsElections().elections.find((e) => e.id === id) ?? null;
}
export function usNeighbours(id: string): { prev: UsElection | null; next: UsElection | null } {
  const els = getUsElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
// The Congress seated immediately after a presidential election year.
export function congressAfter(year: number): UsCongress | null {
  const n = Math.floor((year + 1 - 1789) / 2) + 1;
  return getUsCongress().congresses.find((c) => c.n === n) ?? null;
}
export const usFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const usFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset.
export type UsRecord = { label: string; value: string; electionId: string; detail: string };
export function computeUsRecords(): UsRecord[] {
  const els = getUsElections().elections;
  const recs: UsRecord[] = [];
  const winnerOf = (e: UsElection) => e.candidates.find((c) => c.name === e.winner.name) ?? e.candidates[0];

  const evPctMax = els
    .map((e) => ({ e, w: winnerOf(e), pct: ((winnerOf(e).ev ?? 0) / e.evTotal) * 100 }))
    .filter((x) => x.e.year >= 1824)
    .reduce((a, b) => (a.pct >= b.pct ? a : b));
  recs.push({ label: "Biggest Electoral College sweep", value: `${evPctMax.pct.toFixed(1)}%`,
    electionId: evPctMax.e.id, detail: `${evPctMax.w.name}, ${evPctMax.e.label}: ${evPctMax.w.ev} of ${evPctMax.e.evTotal} electoral votes` });

  const pvMax = els
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.share != null && x.e.year >= 1824)
    .reduce((a, b) => ((a.c.share ?? 0) >= (b.c.share ?? 0) ? a : b));
  recs.push({ label: "Highest popular-vote share", value: usFmtPct(pvMax.c.share), electionId: pvMax.e.id,
    detail: `${pvMax.c.name}, ${pvMax.e.label}` });

  const withT = els.filter((e) => e.turnout != null && e.year >= 1824);
  const tHi = withT.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
  const tLo = withT.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
  recs.push({ label: "Highest turnout", value: usFmtPct(tHi.turnout), electionId: tHi.id, detail: `${tHi.label} election` });
  recs.push({ label: "Lowest turnout since 1824", value: usFmtPct(tLo.turnout), electionId: tLo.id, detail: `${tLo.label} election` });

  // closest popular-vote margin between the top two
  const closest = els
    .map((e) => {
      const withVotes = e.candidates.filter((c) => c.votes != null).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
      if (withVotes.length < 2 || !withVotes[0].votes || !withVotes[1].votes) return null;
      return { e, gap: withVotes[0].votes - withVotes[1].votes, a: withVotes[0], b: withVotes[1] };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.e.year >= 1824)
    .reduce((a, b) => (a.gap <= b.gap ? a : b));
  recs.push({ label: "Closest popular vote", value: `${usFmtInt(closest.gap)} votes`, electionId: closest.e.id,
    detail: `${closest.a.name} over ${closest.b.name}, ${closest.e.label}` });

  const inversions = els.filter((e) => e.inversion);
  recs.push({ label: "Popular-vote winner denied", value: String(inversions.length + 1), electionId: "2016",
    detail: `${inversions.map((e) => e.label).join(", ")} — plus 1824, settled in the House` });

  const mostVotes = els
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.votes != null)
    .reduce((a, b) => ((a.c.votes ?? 0) >= (b.c.votes ?? 0) ? a : b));
  recs.push({ label: "Most votes ever won", value: usFmtInt(mostVotes.c.votes), electionId: mostVotes.e.id,
    detail: `${mostVotes.c.name}, ${mostVotes.e.label}` });

  return recs;
}
