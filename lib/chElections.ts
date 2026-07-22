import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ChElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type ChElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: ChElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type ChElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: ChElection[];
};

// ---------------- loader ----------------
let _core: ChElectionsFile | null = null;
export function getChElections(): ChElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ch-elections.json"), "utf-8"),
  ) as ChElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "Swiss People's Party": "#009150",
  "SVP": "#009150",
  "People's Party": "#009150",
  "Social Democrats": "#E53136",
  "Social Democratic Party": "#E53136",
  "SP": "#E53136",
  "FDP": "#0E52A0",
  "Free Democratic Party": "#0E52A0",
  "Radicals": "#0E52A0",
  "Radical Democratic Party": "#0E52A0",
  "FDP.The Liberals": "#0E52A0",
  "Radical Left": "#4E8EC4",
  "The Centre": "#F18700",
  "Christian Democratic People's Party": "#F18700",
  "CVP": "#F18700",
  "Catholic Conservatives": "#F18700",
  "Conservative People's Party": "#F18700",
  "Greens": "#84B547",
  "Green Party": "#84B547",
  "Green Liberal Party": "#A4C61A",
  "GLP": "#A4C61A",
  "BDP": "#FFD700",
  "Conservative Democratic Party": "#FFD700",
  "Farmers' Party": "#8B5E3C",
  "BGB": "#8B5E3C",
  "Ring of Independents": "#748CAB",
  "Liberal Party": "#37517E",
  "Liberals": "#37517E",
  "Democrats": "#6B9080",
  "Evangelical People's Party": "#B0578D",
  "Independent": "#6b7280",
  "Independents": "#6b7280",
  "Others": "#9ca3af",
};
export function chPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/People's Party|SVP/i.test(name)) return "#009150";
  if (/Social Democrat|Socialist/i.test(name)) return "#E53136";
  if (/Radical|FDP|Free Democratic/i.test(name)) return "#0E52A0";
  if (/Catholic|Christian Democratic|Centre/i.test(name)) return "#F18700";
  if (/Green Liberal/i.test(name)) return "#A4C61A";
  if (/Green/i.test(name)) return "#84B547";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function chEraOf(key: string) {
  return getChElections().eras.find((e) => e.key === key) ?? null;
}
export function chElectionById(id: string): ChElection | null {
  return getChElections().elections.find((e) => e.id === id) ?? null;
}
export function chNeighbours(id: string): { prev: ChElection | null; next: ChElection | null } {
  const els = getChElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const chFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const chFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type ChElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeChRecords(): ChElectionRecord[] {
  const els = getChElections().elections;
  const recs: ChElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: chFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: chFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: chFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: chFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Years one coalition governed", value: "44", electionId: "2003", detail: "the magic formula of 1959–2003: the same four parties, 2:2:2:1, whatever the voters said" });
  recs.push({ label: "Women first voted", value: "1971", electionId: "1971", detail: "the last major democracy to enfranchise women at the federal level" });
  return recs;
}
