import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PkElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type PkElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: PkElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type PkElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: PkElection[];
};

// ---------------- loader ----------------
let _core: PkElectionsFile | null = null;
export function getPkElections(): PkElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "pk-elections.json"), "utf-8"),
  ) as PkElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Pakistani party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Pakistan Peoples Party": "#000000",
  "Pakistan People's Party": "#000000",
  "Pakistan Peoples Party Parliamentarians": "#000000",
  "Pakistan Muslim League (N)": "#006600",
  "Pakistan Muslim League (Q)": "#4CAF50",
  "Pakistan Muslim League (J)": "#66BB6A",
  "Pakistan Muslim League (F)": "#81C784",
  "Pakistan Muslim League (Qayyum)": "#2E7D32",
  "Pakistan Muslim League": "#006600",
  "Convention Muslim League": "#2E7D32",
  "Muslim League": "#006600",
  "Pakistan Tehreek-e-Insaf": "#E4002B",
  "Pakistan Tehreek-e-Insaf independents": "#E4002B",
  "Islami Jamhoori Ittehad": "#1B5E20",
  "Jamiat Ulema-e-Islam (F)": "#0B6E4F",
  "Jamaat-e-Islami": "#0E7C7B",
  "Muttahida Majlis-e-Amal": "#0B6E4F",
  "Muttahida Qaumi Movement": "#C8102E",
  "Haq Parast": "#C8102E",
  "Awami National Party": "#B71C1C",
  "All-Pakistan Awami League": "#00A651",
  "Pakistan National Alliance": "#8D6E63",
  "People's Democratic Alliance": "#455A64",
  "Combined Opposition Parties": "#8D6E63",
  "National Democratic Front": "#5D4037",
  "Balochistan Awami Party": "#7B1FA2",
  "Grand Democratic Alliance": "#6A5ACD",
  "Seats reserved for women": "#78909C",
  "Seats reserved for minorities": "#90A4AE",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
};
export function pkPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Peoples Party|People's Party/i.test(name)) return "#000000";
  if (/Muslim League \(N\)|^Pakistan Muslim League$/i.test(name)) return "#006600";
  if (/Muslim League/i.test(name)) return "#4CAF50";
  if (/Tehreek-e-Insaf/i.test(name)) return "#E4002B";
  if (/Jamaat|Jamiat|Majlis-e-Amal/i.test(name)) return "#0B6E4F";
  if (/Muttahida Qaumi|Haq Parast/i.test(name)) return "#C8102E";
  if (/Awami National/i.test(name)) return "#B71C1C";
  if (/Awami League/i.test(name)) return "#00A651";
  if (/reserved/i.test(name)) return "#78909C";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function pkEraOf(key: string) {
  return getPkElections().eras.find((e) => e.key === key) ?? null;
}
export function pkElectionById(id: string): PkElection | null {
  return getPkElections().elections.find((e) => e.id === id) ?? null;
}
export function pkNeighbours(id: string): { prev: PkElection | null; next: PkElection | null } {
  const els = getPkElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const pkFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-PK"));
export const pkFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type PkElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePkRecords(): PkElectionRecord[] {
  const els = getPkElections().elections.filter((e) => e.unfree !== "unfree");
  const recs: PkElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: pkFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: pkFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: pkFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: pkFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Assemblies that finished a term", value: "3", electionId: "2013", detail: "2008, 2013 and 2018; not one between 1988 and 1999 did" });
  recs.push({ label: "Chosen by 80,000 electors", value: "2", electionId: "1962", detail: "1962 and 1965, decided by the Basic Democracies college" });
  return recs;
}
