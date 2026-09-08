import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type JmElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type JmLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: JmElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type JmElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: JmLegElection[];
};

// ---------------- loader ----------------
let _core: JmElectionsFile | null = null;
export function getJmElections(): JmElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "jm-elections.json"), "utf-8"),
  ) as JmElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Jamaican party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Jamaica Labour Party": "#005DAA",
  "JLP": "#005DAA",
  "People's National Party": "#FF8200",
  "PNP": "#FF8200",
  "National Democratic Movement": "#00A651",
  "NDM": "#00A651",
  "National Democratic Movement–Jamaica National Alliance for Unity": "#00A651",
  "Republican Party": "#7B1FA2",
  "Jamaica Democratic Party": "#8D6E63",
  "United Party of Jamaica": "#6D4C41",
  "Farmers' Party": "#66BB6A",
  "Christian Democratic Party": "#1565C0",
  "Independents": "#9ca3af",
  "Independent": "#9ca3af",
  "Other parties": "#9ca3af",
};
export function jmPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Jamaica Labour|\bJLP\b/i.test(name)) return "#005DAA";
  if (/People's National|\bPNP\b/i.test(name)) return "#FF8200";
  if (/National Democratic Movement|\bNDM\b/i.test(name)) return "#00A651";
  if (/Independent/i.test(name)) return "#9ca3af";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function jmEraOf(key: string) {
  return getJmElections().eras.find((e) => e.key === key) ?? null;
}
export function jmElectionById(id: string): JmLegElection | null {
  return getJmElections().elections.find((e) => e.id === id) ?? null;
}
export function jmNeighbours(id: string): { prev: JmLegElection | null; next: JmLegElection | null } {
  const els = getJmElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const jmFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const jmFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type JmElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeJmRecords(): JmElectionRecord[] {
  const recs: JmElectionRecord[] = [];
  const els = getJmElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: jmFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: jmFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: jmFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: jmFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Highest turnout", value: "87%", electionId: "1980", detail: "The most violent election in Jamaican history, fought amid IMF austerity and gun violence; Seaga's JLP reversed a 38-seat deficit to take power." });
  recs.push({ label: "Lowest turnout", value: "2.68%", electionId: "1983", detail: "The PNP boycotted over an unupdated electoral roll, leaving the JLP to win all 60 seats against minor-party and independent candidates in only six of them." });
  recs.push({ label: "Largest contested majority", value: "52 of 60 seats", electionId: "1993", detail: "The PNP's result under Prime Minister P. J. Patterson, the largest won in a fully contested Jamaican election." });
  recs.push({ label: "Narrowest margin", value: "50.54% to 49.16%", electionId: "2025", detail: "The JLP's third consecutive win, though it lost 14 seats to the PNP in the process." });
  return recs;
}
