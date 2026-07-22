import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type SgElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type SgElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: SgElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type SgElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: SgElection[];
};

// ---------------- loader ----------------
let _core: SgElectionsFile | null = null;
export function getSgElections(): SgElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "sg-elections.json"), "utf-8"),
  ) as SgElectionsFile);
}

// ---------------- party colors ----------------
// Conventional colors; the name always accompanies the color.
const P: Record<string, string> = {
  "PAP": "#D71920",
  "People's Action Party": "#D71920",
  "WP": "#00AEEF",
  "Workers' Party": "#00AEEF",
  "SDP": "#E4003B",
  "Singapore Democratic Party": "#E4003B",
  "PSP": "#7B2D8B",
  "Progress Singapore Party": "#7B2D8B",
  "SPP": "#F4A259",
  "Barisan Sosialis": "#CC0000",
  "BS": "#CC0000",
  "Labour Front": "#C1440E",
  "Progressive": "#4E8EC4",
  "Progressive Party": "#4E8EC4",
  "SDA": "#6B9080",
  "UPP": "#748CAB",
  "United People's Party": "#748CAB",
  "SA": "#37517E",
  "Singapore Alliance": "#37517E",
  "UMNO": "#1C3E94",
  "Independent": "#6b7280",
  "Independents": "#6b7280",
  "Others": "#9ca3af",
};
export function sgPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/PAP|Action Party/i.test(name)) return "#D71920";
  if (/Workers/i.test(name)) return "#00AEEF";
  if (/Barisan/i.test(name)) return "#CC0000";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function sgEraOf(key: string) {
  return getSgElections().eras.find((e) => e.key === key) ?? null;
}
export function sgElectionById(id: string): SgElection | null {
  return getSgElections().elections.find((e) => e.id === id) ?? null;
}
export function sgNeighbours(id: string): { prev: SgElection | null; next: SgElection | null } {
  const els = getSgElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const sgFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const sgFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

export type SgElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeSgRecords(): SgElectionRecord[] {
  const els = getSgElections().elections;
  const recs: SgElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: sgFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: sgFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: sgFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: sgFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Consecutive PAP victories", value: "17", electionId: "2025", detail: "every general election since 1959 — the longest winning streak of any elected ruling party" });
  recs.push({ label: "Walkover elections", value: "4", electionId: "1968", detail: "1968–1980: the PAP won every seat, most without a contest" });
  return recs;
}
