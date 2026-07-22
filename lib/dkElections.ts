import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type DkElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type DkElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: DkElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type DkElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: DkElection[];
};

// ---------------- loader ----------------
let _core: DkElectionsFile | null = null;
export function getDkElections(): DkElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "dk-elections.json"), "utf-8"),
  ) as DkElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "Social Democrats": "#A82721",
  "Social Democratic Party": "#A82721",
  "Social Democracy": "#A82721",
  "Venstre": "#005392",
  "Left": "#005392",
  "Moderate Left": "#005392",
  "Liberals": "#005392",
  "Conservatives": "#00583C",
  "Conservative People's Party": "#00583C",
  "Højre": "#37517E",
  "Right": "#37517E",
  "Social Liberals": "#733280",
  "Danish Social Liberal Party": "#733280",
  "Radikale": "#733280",
  "Radikale Venstre": "#733280",
  "DPP": "#EAC73E",
  "Danish People's Party": "#EAC73E",
  "Green Left": "#9C1D2A",
  "SF": "#9C1D2A",
  "Socialist People's Party": "#9C1D2A",
  "Red–Green": "#E6801A",
  "Red-Green": "#E6801A",
  "Red–Green Alliance": "#E6801A",
  "Enhedslisten": "#E6801A",
  "Liberal Alliance": "#3FB2E4",
  "Moderates": "#B48CD2",
  "New Right": "#7B2D8B",
  "Denmark Democrats": "#00565F",
  "The Alternative": "#84B547",
  "Progress Party": "#F4A259",
  "Justice Party": "#6B9080",
  "Communist Party": "#CC0000",
  "Citizens' Party": "#748CAB",
  "Centre Democrats": "#4E8EC4",
  "Christian Democrats": "#B0578D",
  "Christian People's Party": "#B0578D",
  "Independent": "#6b7280",
  "Independents": "#6b7280",
  "Others": "#9ca3af",
};
export function dkPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Social Democrat/i.test(name)) return "#A82721";
  if (/Venstre$|^Left$/i.test(name)) return "#005392";
  if (/Conservative/i.test(name)) return "#00583C";
  if (/Radical|Social Liberal/i.test(name)) return "#733280";
  if (/People's Party/i.test(name)) return "#EAC73E";
  if (/Communist/i.test(name)) return "#CC0000";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function dkEraOf(key: string) {
  return getDkElections().eras.find((e) => e.key === key) ?? null;
}
export function dkElectionById(id: string): DkElection | null {
  return getDkElections().elections.find((e) => e.id === id) ?? null;
}
export function dkNeighbours(id: string): { prev: DkElection | null; next: DkElection | null } {
  const els = getDkElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const dkFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const dkFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type DkElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeDkRecords(): DkElectionRecord[] {
  const els = getDkElections().elections;
  const recs: DkElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: dkFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: dkFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: dkFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: dkFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Parties after the earthquake", value: "10", electionId: "1973", detail: "the 1973 jordskredsvalg doubled the Folketing's party count in a single night" });
  recs.push({ label: "Social Democrats largest party", value: "77 yrs", electionId: "2001", detail: "from 1924 until Fogh Rasmussen's 2001 bloc shift — then again from 2019" });
  return recs;
}
