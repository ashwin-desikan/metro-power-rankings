import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type NoElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type NoElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: NoElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type NoElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: NoElection[];
};

// ---------------- loader ----------------
let _core: NoElectionsFile | null = null;
export function getNoElections(): NoElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "no-elections.json"), "utf-8"),
  ) as NoElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Norwegian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Labour Party": "#E51C30",
  "Norwegian Labour Party": "#E51C30",
  "Social Democratic Labour Party": "#E51C30",
  "Conservative Party": "#007AC8",
  "Progress Party": "#002E5E",
  "Anders Lange's Party": "#002E5E",
  "Centre Party": "#00843D",
  "Farmers' Party": "#00843D",
  "Norwegian Agrarian Association": "#00843D",
  "Christian Democratic Party": "#FFB61E",
  "Liberal Party": "#00807D",
  "Moderate Liberal Party": "#6EA8A5",
  "Free-minded Liberal Party": "#6EA8A5",
  "Free-minded People's Party": "#6EA8A5",
  "Radical People's Party": "#8BC34A",
  "Labour Democrats": "#EF9A9A",
  "Socialist Left Party": "#C4122E",
  "Socialist People's Party": "#C4122E",
  "Communist Party": "#9E1B1B",
  "Red Party": "#8B0000",
  "Red Electoral Alliance": "#8B0000",
  "Green Party": "#5CB85C",
  "Coastal Party": "#4E6E81",
  "Society Party": "#795548",
  "Patient Focus": "#7E57C2",
  "Future for Finnmark": "#7E57C2",
  "Independents": "#9ca3af",
  "Other parties and independents": "#9ca3af",
};
export function noPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Labour/i.test(name)) return "#E51C30";
  if (/Conservative/i.test(name)) return "#007AC8";
  if (/Progress/i.test(name)) return "#002E5E";
  if (/Christian/i.test(name)) return "#FFB61E";
  if (/Centre|Farmers|Agrarian/i.test(name)) return "#00843D";
  if (/Liberal/i.test(name)) return "#00807D";
  if (/Socialist|Communist|Red/i.test(name)) return "#C4122E";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function noEraOf(key: string) {
  return getNoElections().eras.find((e) => e.key === key) ?? null;
}
export function noElectionById(id: string): NoElection | null {
  return getNoElections().elections.find((e) => e.id === id) ?? null;
}
export function noNeighbours(id: string): { prev: NoElection | null; next: NoElection | null } {
  const els = getNoElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const noFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("nb-NO"));
export const noFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type NoElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeNoRecords(): NoElectionRecord[] {
  const els = getNoElections().elections.filter((e) => e.unfree !== "unfree");
  const recs: NoElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: noFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: noFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: noFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: noFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Elections with no parties", value: "24", electionId: "1815", detail: "1815 to 1879, before Venstre and H\u00f8yre existed" });
  recs.push({ label: "Labour majorities", value: "6", electionId: "1957", detail: "consecutive absolute majorities of seats, 1945 to 1961" });
  return recs;
}
