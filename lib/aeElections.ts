import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type AeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type AeLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: AeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type AeElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: AeLegElection[];
};

// ---------------- loader ----------------
let _core: AeElectionsFile | null = null;
export function getAeElections(): AeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ae-elections.json"), "utf-8"),
  ) as AeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Emirati party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Independents": "#9ca3af",
  "Independent": "#9ca3af",
};
export function aePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function aeEraOf(key: string) {
  return getAeElections().eras.find((e) => e.key === key) ?? null;
}
export function aeElectionById(id: string): AeLegElection | null {
  return getAeElections().elections.find((e) => e.id === id) ?? null;
}
export function aeNeighbours(id: string): { prev: AeLegElection | null; next: AeLegElection | null } {
  const els = getAeElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const aeFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const aeFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type AeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeAeRecords(): AeElectionRecord[] {
  const recs: AeElectionRecord[] = [];
  const els = getAeElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: aeFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: aeFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: aeFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: aeFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest electoral college", value: "398,879", electionId: "2023", detail: "The college that elected the 2023 council, up from 337,738 in 2019 and sixty times the 6,595 who voted in 2006." });
  recs.push({ label: "Smallest electoral college", value: "6,595", electionId: "2006", detail: "The UAE's first ever parliamentary election was decided by a college of 6,595 handpicked citizens, of whom 1,163 were women." });
  recs.push({ label: "Highest turnout", value: "74.4%", electionId: "2006", detail: "Turnout at the first election, among the small, handpicked college eligible to vote, was the highest of the five." });
  recs.push({ label: "Lowest turnout", value: "27.75%", electionId: "2011", detail: "Turnout fell by nearly 47 points as the college expanded to 129,274 members, its steepest one-election jump." });
  return recs;
}
