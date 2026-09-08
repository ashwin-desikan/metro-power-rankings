import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type VnElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type VnLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: VnElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type VnElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: VnLegElection[];
};

// ---------------- loader ----------------
let _core: VnElectionsFile | null = null;
export function getVnElections(): VnElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "vn-elections.json"), "utf-8"),
  ) as VnElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Vietnamese party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Indochinese Communist Party": "#DA251D",
  "Communist Party of Vietnam": "#DA251D",
  "Workers' Party of Vietnam and other groups": "#DA251D",
  "Vietnamese Fatherland Front": "#B5261C",
  "National Liberation Front–Vietnam Alliance of National, Democratic and Peaceful Forces": "#C2410C",
  "Democratic Party": "#D4AF37",
  "Socialist Party": "#2E7D32",
  "Việt Nam Quốc Dân Đảng": "#1565C0",
  "Revolutionary League": "#6A8CAF",
  "Independents": "#6b7280",
  "Non-party members": "#9ca3af",
  "Independents (organization-nominated)": "#9ca3af",
  "Independents (self-nominated)": "#6b7280",
  "Reserved seats": "#9ca3af",
};
export function vnPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independent/i.test(name)) return "#6b7280";
  if (/Non-party/i.test(name)) return "#9ca3af";
  if (/Communist/i.test(name)) return "#DA251D";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function vnEraOf(key: string) {
  return getVnElections().eras.find((e) => e.key === key) ?? null;
}
export function vnElectionById(id: string): VnLegElection | null {
  return getVnElections().elections.find((e) => e.id === id) ?? null;
}
export function vnNeighbours(id: string): { prev: VnLegElection | null; next: VnLegElection | null } {
  const els = getVnElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const vnFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const vnFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type VnElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeVnRecords(): VnElectionRecord[] {
  const recs: VnElectionRecord[] = [];
  const els = getVnElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: vnFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: vnFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: vnFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: vnFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Highest turnout", value: "99.9%", electionId: "1960", detail: "North Vietnam's first Fatherland Front election under Ho Chi Minh returned the highest turnout on file." });
  recs.push({ label: "Lowest turnout", value: "97.96%", electionId: "1981", detail: "The lowest turnout on record for this hub, though still officially above 97 percent, a floor these elections have never fallen below." });
  recs.push({ label: "Most self-nominated candidates", value: "11", electionId: "2016", detail: "The 2016 ballot was the first to report self-nominated candidates as their own line: 11 ran, and 2 won seats." });
  recs.push({ label: "Self-nomination filtered hardest", value: "15 of 82", electionId: "2011", detail: "82 people applied to stand as self-nominated candidates in 2011. Officials allowed 15 onto the ballot, and 4 of them were elected." });
  return recs;
}
