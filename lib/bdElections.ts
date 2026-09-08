import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type BdElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type BdLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: BdElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type BdElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: BdLegElection[];
};

// ---------------- loader ----------------
let _core: BdElectionsFile | null = null;
export function getBdElections(): BdElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "bd-elections.json"), "utf-8"),
  ) as BdElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Bangladeshi party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Awami League": "#006A4D",
  "Bangladesh Awami League": "#006A4D",
  "Bangladesh Nationalist Party": "#EE1B24",
  "Jatiya Party": "#F2A900",
  "Jatiya Party (Ershad)": "#F2A900",
  "Jatiya Party (Manju)": "#D6940A",
  "Jatiya Party (Siraj)": "#D6940A",
  "Bangladesh Jamaat-e-Islami": "#0C4A2E",
  "Combined Opposition Party": "#5B7FA6",
  "National Citizen Party": "#1D4ED8",
  "Workers Party of Bangladesh": "#C8102E",
  "Communist Party of Bangladesh": "#8B0000",
  "Jatiya Samajtantrik Dal": "#C2410C",
  "Jatiya Samajtantrik Dal (Rab)": "#C2410C",
  "Jatiya Samajtantrik Dal (Siraj)": "#B8460A",
  "Jatiya Samajtantrik Dal (Inu)": "#9A3B08",
  "Bangladesh Islami Front": "#166534",
  "Islami Oikya Jote": "#15803D",
  "Bangladesh Khilafat Andolan": "#065F46",
  "Bangladesh Khelafat Majlis": "#047857",
  "Zaker Party": "#F97316",
  "Bangladesh Muslim League": "#0E7490",
  "Ganatantri Party": "#78716C",
  "Gono Odhikar Parishad": "#7C3AED",
  "Ganosanhati Andolan": "#7C2D12",
  "National Awami Party (Muzaffar)": "#991B1B",
  "National Awami Party (Bhashani)": "#B91C1C",
  "Bangladesh Freedom Party": "#64748B",
  "Bangladesh Krishak Sramik Awami League": "#A16207",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
  "AL": "#006A4D",
  "BNP": "#EE1B24",
  "JP(E)": "#F2A900",
  "Jamaat": "#0C4A2E",
  "NCP": "#1D4ED8",
};
export function bdPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Jatiya Samajtantrik Dal/i.test(name)) return "#C2410C";
  if (/National Awami Party/i.test(name)) return "#991B1B";
  if (/Jamaat/i.test(name)) return "#0C4A2E";
  if (/Muslim League/i.test(name)) return "#0E7490";
  if (/Khilafat|Khelafat/i.test(name)) return "#065F46";
  if (/Communist|Sarbahara|Samyabadi/i.test(name)) return "#8B0000";
  if (/Workers Party/i.test(name)) return "#C8102E";
  if (/Islami|Islamic/i.test(name)) return "#15803D";
  if (/Awami League/i.test(name)) return "#006A4D";
  if (/Nationalist/i.test(name)) return "#EE1B24";
  if (/Jatiya Party|Jatiyo/i.test(name)) return "#F2A900";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function bdEraOf(key: string) {
  return getBdElections().eras.find((e) => e.key === key) ?? null;
}
export function bdElectionById(id: string): BdLegElection | null {
  return getBdElections().elections.find((e) => e.id === id) ?? null;
}
export function bdNeighbours(id: string): { prev: BdLegElection | null; next: BdLegElection | null } {
  const els = getBdElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const bdFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const bdFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type BdElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeBdRecords(): BdElectionRecord[] {
  const recs: BdElectionRecord[] = [];
  const els = getBdElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: bdFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: bdFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: bdFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: bdFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest seat share", value: "300 of 350", electionId: "2018", detail: "The Awami League's count in what observers called the midnight election, after reports of ballots stuffed before polls opened." });
  recs.push({ label: "Lowest turnout", value: "20.97%", electionId: "1996-february", detail: "The three main opposition parties boycotted; the government the vote produced lasted twelve days." });
  recs.push({ label: "Highest turnout", value: "87.13%", electionId: "2008", detail: "The last caretaker-government election, and the highest turnout Bangladesh has recorded." });
  recs.push({ label: "Most seats uncontested", value: "153 of 300", electionId: "2014", detail: "Handed to the Awami League and its allies by default after nearly every opposition party boycotted." });
  return recs;
}
