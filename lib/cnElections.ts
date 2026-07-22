import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CnElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type CnElection = {
  id: string; // convening year
  label: string; // "14th NPC"
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: CnElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null; // NPC Standing Committee chairman
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CnElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: CnElection[];
};

// ---------------- loader ----------------
let _core: CnElectionsFile | null = null;
export function getCnElections(): CnElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "cn-elections.json"), "utf-8"),
  ) as CnElectionsFile);
}

// ---------------- party colors ----------------
// The CCP in red; the eight licensed minor parties in muted tones — the
// palette itself reflects that they are not opposition parties.
const P: Record<string, string> = {
  "Chinese Communist Party": "#DE2910", CCP: "#DE2910", CPC: "#DE2910",
  "Revolutionary Committee of the Chinese Kuomintang": "#5A7D9A",
  "China Democratic League": "#8A7CA8",
  "China National Democratic Construction Association": "#7A9E7E",
  "China Association for Promoting Democracy": "#B08968",
  "Chinese Peasants' and Workers' Democratic Party": "#6B9080",
  "China Zhi Gong Party": "#9A8C98",
  "Jiusan Society": "#748CAB",
  "Taiwan Democratic Self-Government League": "#A98467",
  "Other licensed parties and independents": "#9ca3af",
  Independents: "#6b7280", Others: "#9ca3af",
};
export function cnPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Communist/i.test(name)) return "#DE2910";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function cnEraOf(key: string) {
  return getCnElections().eras.find((e) => e.key === key) ?? null;
}
export function cnElectionById(id: string): CnElection | null {
  return getCnElections().elections.find((e) => e.id === id) ?? null;
}
export function cnNeighbours(id: string): { prev: CnElection | null; next: CnElection | null } {
  const els = getCnElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const cnFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const cnFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// "Records" framed for what the institution is: the numbers of a one-party
// state's legislature, not of competitive elections.
export type CnElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCnRecords(): CnElectionRecord[] {
  const els = getCnElections().elections;
  const recs: CnElectionRecord[] = [];
  const withTotal = els.filter((e) => e.totalSeats != null);
  if (withTotal.length) {
    const big = withTotal.reduce((a, b) => ((a.totalSeats ?? 0) >= (b.totalSeats ?? 0) ? a : b));
    recs.push({ label: "Largest congress", value: cnFmtInt(big.totalSeats), electionId: big.id, detail: `${big.label} — the world's largest legislative body` });
  }
  recs.push({ label: "Direct national elections held", value: "0", electionId: "1949", detail: "no Chinese citizen has ever voted directly for a national leader or legislature" });
  recs.push({ label: "Licensed minor parties", value: "8", electionId: "2023", detail: "every one formally accepts Communist Party leadership" });
  recs.push({ label: "Votes against ending term limits", value: "2", electionId: "2018", detail: "of 2,964 cast at the 13th NPC in 2018" });
  recs.push({ label: "Years without convening", value: "10", electionId: "1964", detail: "the 3rd NPC did not meet between 1965 and 1975, frozen by the Cultural Revolution" });
  return recs;
}
