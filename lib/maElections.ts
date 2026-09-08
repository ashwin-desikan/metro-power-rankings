import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type MaElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type MaLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: MaElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type MaElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: MaLegElection[];
};

// ---------------- loader ----------------
let _core: MaElectionsFile | null = null;
export function getMaElections(): MaElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ma-elections.json"), "utf-8"),
  ) as MaElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Moroccan party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Istiqlal Party": "#DA251D",
  "Istiqlal": "#DA251D",
  "Socialist Union of Popular Forces": "#F97316",
  "USFP": "#F97316",
  "National Union of Popular Forces": "#F97316",
  "UNFP": "#F97316",
  "National Rally of Independents": "#0033A0",
  "RNI": "#0033A0",
  "Popular Movement": "#059669",
  "MP": "#059669",
  "National Popular Movement": "#65A30D",
  "MNP": "#65A30D",
  "Constitutional Union": "#7C3AED",
  "UC": "#7C3AED",
  "Justice and Development Party": "#1F3864",
  "PJD": "#1F3864",
  "Authenticity and Modernity Party": "#B45309",
  "PAM": "#B45309",
  "Party of Progress and Socialism": "#B91C1C",
  "PPS": "#B91C1C",
  "Moroccan Communist Party": "#B91C1C",
  "National Democratic Party": "#CA8A04",
  "PND": "#CA8A04",
  "Democratic Independence Party": "#0891B2",
  "PDI": "#0891B2",
  "Front for the Defence of Constitutional Institutions": "#78716C",
  "FDIC": "#78716C",
  "Democratic and Social Movement": "#DB2777",
  "MDS": "#DB2777",
  "Front of Democratic Forces": "#4D7C0F",
  "FFD": "#4D7C0F",
  "Federation of the Democratic Left": "#4D7C0F",
  "Organisation for Democratic and Popular Action": "#57534E",
  "ODPA": "#57534E",
  "Action Party": "#9333EA",
  "Constitutional and Democratic Popular Movement": "#0D9488",
  "MPDC": "#0D9488",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
};
export function maPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Istiqlal/i.test(name)) return "#DA251D";
  if (/Socialist Union|National Union of Popular Forces|USFP|UNFP/i.test(name)) return "#F97316";
  if (/National Rally of Independents|\bRNI\b/i.test(name)) return "#0033A0";
  if (/National Popular Movement|\bMNP\b/i.test(name)) return "#65A30D";
  if (/Popular Movement|\bMP\b/i.test(name)) return "#059669";
  if (/Constitutional Union|\bUC\b/i.test(name)) return "#7C3AED";
  if (/Justice and Development|\bPJD\b/i.test(name)) return "#1F3864";
  if (/Authenticity and Modernity|\bPAM\b/i.test(name)) return "#B45309";
  if (/Progress and Socialism|Communist|\bPPS\b/i.test(name)) return "#B91C1C";
  if (/Independent/i.test(name)) return "#9ca3af";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function maEraOf(key: string) {
  return getMaElections().eras.find((e) => e.key === key) ?? null;
}
export function maElectionById(id: string): MaLegElection | null {
  return getMaElections().elections.find((e) => e.id === id) ?? null;
}
export function maNeighbours(id: string): { prev: MaLegElection | null; next: MaLegElection | null } {
  const els = getMaElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const maFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const maFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type MaElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeMaRecords(): MaElectionRecord[] {
  const recs: MaElectionRecord[] = [];
  const els = getMaElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: maFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: maFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: maFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: maFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Highest turnout", value: "82.36%", electionId: "1977", detail: "The highest turnout on record for a Moroccan general election." });
  recs.push({ label: "Lowest turnout", value: "37.00%", electionId: "2007", detail: "PJD topped the vote that year but Istiqlal still formed the government on more seats." });
  recs.push({ label: "Largest single-party mandate", value: "125 of 395 seats", electionId: "2016", detail: "PJD's second consecutive first-place finish, before its 2021 collapse to 13 seats." });
  recs.push({ label: "Sharpest reversal", value: "125 seats to 13", electionId: "2021", detail: "PJD's seat count fell by 112 between 2016 and 2021 as RNI took first place." });
  return recs;
}
