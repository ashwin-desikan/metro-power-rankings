import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type WiElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type WiLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: WiElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type WiElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: WiLegElection[];
};

// ---------------- loader ----------------
let _core: WiElectionsFile | null = null;
export function getWiElections(): WiElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "wi-elections.json"), "utf-8"),
  ) as WiElectionsFile);
}

// ---------------- party colors ----------------
// Conventional West Indian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "West Indies Federal Labour Party": "#006400",
  "West Indies Democratic Labour Party": "#FFD700",
  "Barbados National Party": "#1B3F8B",
};
export function wiPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/West Indies Federal Labour|WIFLP/i.test(name)) return "#006400";
  if (/Democratic Labour Party|\bDLP\b/i.test(name)) return "#FFD700";
  if (/Barbados National/i.test(name)) return "#1B3F8B";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function wiEraOf(key: string) {
  return getWiElections().eras.find((e) => e.key === key) ?? null;
}
export function wiElectionById(id: string): WiLegElection | null {
  return getWiElections().elections.find((e) => e.id === id) ?? null;
}
export function wiNeighbours(id: string): { prev: WiLegElection | null; next: WiLegElection | null } {
  const els = getWiElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const wiFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const wiFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type WiElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeWiRecords(): WiElectionRecord[] {
  const recs: WiElectionRecord[] = [];
  const els = getWiElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: wiFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: wiFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: wiFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: wiFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Only election held", value: "25 March 1958", electionId: "1958", detail: "The West Indies Federation's first and last election." });
  recs.push({ label: "Largest territorial delegation", value: "17 of 45 seats", electionId: "1958", detail: "Jamaica, including the Cayman Islands and the Turks and Caicos Islands, returned more members than any other territory." });
  return recs;
}
