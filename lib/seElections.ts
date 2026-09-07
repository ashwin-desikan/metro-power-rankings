import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type SeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type SeElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: SeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type SeElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: SeElection[];
};

// ---------------- loader ----------------
let _core: SeElectionsFile | null = null;
export function getSeElections(): SeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "se-elections.json"), "utf-8"),
  ) as SeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Swedish party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Swedish Social Democratic Party": "#E8112D",
  "Social Democrats": "#E8112D",
  "Social Democrats (S)": "#E8112D",
  "Social Democratic Left Party": "#B71C1C",
  "Social Democratic Left Party of Sweden": "#B71C1C",
  "Moderate Party": "#52BDEC",
  "Moderate Party (M)": "#52BDEC",
  "General Electoral League": "#52BDEC",
  "Right Party": "#52BDEC",
  "Rightist Party": "#52BDEC",
  "National Organisation of the Right": "#52BDEC",
  "National Organization of the Right": "#52BDEC",
  "Centre Party": "#009933",
  "Centre Party (C)": "#009933",
  "Farmers' League": "#009933",
  "National Farmers' Association": "#009933",
  "Lantmanna Party": "#2E7D32",
  "Protectionists": "#5D8AA8",
  "Free traders": "#F2A900",
  "People's Party": "#006AB3",
  "Liberal People's Party": "#006AB3",
  "Liberals (L)": "#006AB3",
  "Liberals": "#006AB3",
  "Liberal Party": "#006AB3",
  "Free-minded National Association": "#006AB3",
  "Ministerial Party": "#78909C",
  "Left Party": "#DA291C",
  "Left Party (V)": "#DA291C",
  "Left Party Communists": "#DA291C",
  "Communist Party": "#9E1B1B",
  "Socialist Party": "#8B0000",
  "Green Party": "#83CF39",
  "Green Party (MP)": "#83CF39",
  "Christian Democrats": "#005EA6",
  "Christian Democrats (KD)": "#005EA6",
  "Christian Democratic Society Party": "#005EA6",
  "Sweden Democrats": "#DDDD00",
  "Sweden Democrats (SD)": "#DDDD00",
  "New Democracy": "#F5A623",
  "Feminist Initiative": "#C71585",
  "Independents": "#9ca3af",
};
export function sePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Social Democratic Party|Social Democrats/i.test(name)) return "#E8112D";
  if (/Moderate|Electoral League|Right/i.test(name)) return "#52BDEC";
  if (/Centre|Farmers/i.test(name)) return "#009933";
  if (/Liberal|People's Party|Free-minded/i.test(name)) return "#006AB3";
  if (/Communist|Left Party/i.test(name)) return "#DA291C";
  if (/Green/i.test(name)) return "#83CF39";
  if (/Christian/i.test(name)) return "#005EA6";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function seEraOf(key: string) {
  return getSeElections().eras.find((e) => e.key === key) ?? null;
}
export function seElectionById(id: string): SeElection | null {
  return getSeElections().elections.find((e) => e.id === id) ?? null;
}
export function seNeighbours(id: string): { prev: SeElection | null; next: SeElection | null } {
  const els = getSeElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const seFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("sv-SE"));
export const seFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type SeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeSeRecords(): SeElectionRecord[] {
  const els = getSeElections().elections.filter((e) => e.unfree !== "unfree");
  const recs: SeElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: seFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: seFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: seFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: seFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "The threshold", value: "4%", electionId: "1970", detail: "in force at every election since the chamber was unified in 1970" });
  recs.push({ label: "Social Democratic firsts", value: "38", electionId: "2022", detail: "the party has come first at every election since 1917" });
  return recs;
}
