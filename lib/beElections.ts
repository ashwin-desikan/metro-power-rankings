import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type BeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type BeElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: BeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type BeElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: BeElection[];
};

// ---------------- loader ----------------
let _core: BeElectionsFile | null = null;
export function getBeElections(): BeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "be-elections.json"), "utf-8"),
  ) as BeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "Catholic Party": "#F18700",
  "Catholics": "#F18700",
  "Catholic": "#F18700",
  "CVP": "#F18700",
  "CD&V": "#F18700",
  "PSC": "#F18700",
  "Christian Social Party": "#F18700",
  "Christian Social": "#F18700",
  "Les Engagés": "#00A5B5",
  "Liberal Party": "#0047AB",
  "Liberals": "#0047AB",
  "PVV": "#0047AB",
  "Open Vld": "#0047AB",
  "Open VLD": "#0047AB",
  "MR": "#0047AB",
  "PRL": "#0047AB",
  "Belgian Workers' Party": "#E30613",
  "POB": "#E30613",
  "BWP": "#E30613",
  "Belgian Socialist Party": "#E30613",
  "PS": "#E30613",
  "Vooruit": "#E30613",
  "sp.a": "#E30613",
  "SP": "#E30613",
  "Socialist Party": "#E30613",
  "N-VA": "#F5C400",
  "New Flemish Alliance": "#F5C400",
  "Volksunie": "#F5C400",
  "VU": "#F5C400",
  "Vlaams Belang": "#5A3E1B",
  "Vlaams Blok": "#5A3E1B",
  "VB": "#5A3E1B",
  "Rex": "#3a3a4a",
  "Rexist Party": "#3a3a4a",
  "Communist Party": "#CC0000",
  "KPB-PCB": "#CC0000",
  "PTB-PVDA": "#8E1B1B",
  "PVDA-PTB": "#8E1B1B",
  "Workers' Party of Belgium": "#8E1B1B",
  "Ecolo": "#84B547",
  "Groen": "#84B547",
  "Agalev": "#84B547",
  "Ecolo-Groen": "#84B547",
  "FDF": "#B0578D",
  "DéFI": "#B0578D",
  "RW": "#748CAB",
  "FN": "#444444",
  "Independent": "#6b7280",
  "Independents": "#6b7280",
  "Others": "#9ca3af",
};
export function bePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Catholic|Christian/i.test(name)) return "#F18700";
  if (/Liberal|MR|Vld/i.test(name)) return "#0047AB";
  if (/Socialist|Workers'? Party$|Vooruit/i.test(name)) return "#E30613";
  if (/Flemish Alliance|N-VA|Volksunie/i.test(name)) return "#F5C400";
  if (/Vlaams B/i.test(name)) return "#5A3E1B";
  if (/Ecolo|Groen/i.test(name)) return "#84B547";
  if (/Communist/i.test(name)) return "#CC0000";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function beEraOf(key: string) {
  return getBeElections().eras.find((e) => e.key === key) ?? null;
}
export function beElectionById(id: string): BeElection | null {
  return getBeElections().elections.find((e) => e.id === id) ?? null;
}
export function beNeighbours(id: string): { prev: BeElection | null; next: BeElection | null } {
  const els = getBeElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const beFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const beFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type BeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeBeRecords(): BeElectionRecord[] {
  const els = getBeElections().elections;
  const recs: BeElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: beFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: beFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: beFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: beFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Days without a government", value: "541", electionId: "2010", detail: "the world record, set after the 2010 election — then nearly matched with 494 after 2019" });
  recs.push({ label: "Catholic majorities under plural voting", value: "10", electionId: "1894", detail: "every election from 1894 to 1912 — the weighted franchise at work" });
  return recs;
}
