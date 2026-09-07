import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type HuElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type HuElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: HuElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type HuElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: HuElection[];
};

// ---------------- loader ----------------
let _core: HuElectionsFile | null = null;
export function getHuElections(): HuElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "hu-elections.json"), "utf-8"),
  ) as HuElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Hungarian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Fidesz–KDNP": "#FF6A00",
  "Fidesz": "#FF6A00",
  "Fidesz–MDF": "#FF6A00",
  "Tisza Party": "#00A0B0",
  "TISZA": "#00A0B0",
  "Hungarian Socialist Party": "#CE2939",
  "MSZP": "#CE2939",
  "Hungarian Socialist Workers' Party": "#B00000",
  "MSZMP": "#B00000",
  "Hungarian Working People's Party": "#B00000",
  "Hungarian Communist Party": "#B00000",
  "Alliance of Free Democrats": "#1E90C8",
  "Hungarian Democratic Forum": "#1B5E20",
  "Jobbik": "#20603D",
  "Politics Can Be Different": "#4CAF50",
  "Our Homeland Movement": "#6B8E23",
  "Democratic Coalition": "#0057B7",
  "United for Hungary": "#3F51B5",
  "Unity": "#3F51B5",
  "Independent Smallholders Party": "#8D6E63",
  "Independent Smallholders' Party": "#8D6E63",
  "Social Democratic Party of Hungary": "#D32F2F",
  "National Peasant Party": "#7CB342",
  "Civic Democratic Party": "#26A69A",
  "Democratic People's Party": "#5C6BC0",
  "Party of Hungarian Life": "#455A64",
  "Party of National Unity": "#455A64",
  "Unity Party": "#455A64",
  "Arrow Cross Party": "#3E2723",
  "Liberal Party": "#F2A900",
  "Deák Party": "#F2A900",
  "Party of Independence and '48": "#7B1FA2",
  "Party of Independence": "#7B1FA2",
  "'48ers Party of Independence": "#7B1FA2",
  "Party of 1848": "#7B1FA2",
  "Left Centre": "#9575CD",
  "National Party of Work": "#37474F",
  "Catholic People's Party": "#1565C0",
  "National Party": "#546E7A",
  "Moderate Opposition": "#8D6E63",
  "United Opposition": "#8D6E63",
  "Reformers": "#2E7D32",
  "Conservatives": "#455A64",
  "Centrists": "#9e9e9e",
  "Royalists": "#455A64",
  "Constitutionalists": "#2E7D32",
  "Independents": "#9ca3af",
  "Independent moderate": "#9ca3af",
};
export function huPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Fidesz/i.test(name)) return "#FF6A00";
  if (/Socialist Workers|Working People/i.test(name)) return "#B00000";
  if (/Socialist|Social Democratic/i.test(name)) return "#CE2939";
  if (/Smallholders/i.test(name)) return "#8D6E63";
  if (/Liberal|Deák/i.test(name)) return "#F2A900";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function huEraOf(key: string) {
  return getHuElections().eras.find((e) => e.key === key) ?? null;
}
export function huElectionById(id: string): HuElection | null {
  return getHuElections().elections.find((e) => e.id === id) ?? null;
}
export function huNeighbours(id: string): { prev: HuElection | null; next: HuElection | null } {
  const els = getHuElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const huFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("hu-HU"));
export const huFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type HuElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeHuRecords(): HuElectionRecord[] {
  const els = getHuElections().elections.filter((e) => e.unfree !== "unfree");
  const recs: HuElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: huFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: huFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: huFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: huFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Two-thirds majorities", value: "3", electionId: "2018", detail: "Fidesz in 2010, 2014 and 2018, each on about half the list vote" });
  recs.push({ label: "Years without a contest", value: "37", electionId: "1949", detail: "1949 to 1985, nine ballots with one list on them" });
  return recs;
}
