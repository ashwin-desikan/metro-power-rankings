import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type DdElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type DdLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: DdElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type DdElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: DdLegElection[];
};

// ---------------- loader ----------------
let _core: DdElectionsFile | null = null;
export function getDdElections(): DdElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "dd-elections.json"), "utf-8"),
  ) as DdElectionsFile);
}

// ---------------- party colors ----------------
// Conventional East German party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Socialist Unity Party": "#8B1A1A",
  "Socialist Unity Party of Germany": "#8B1A1A",
  "Christian Democratic Union": "#000000",
  "Liberal Democratic Party": "#FFD500",
  "Liberal Democratic Party of Germany": "#FFD500",
  "National Democratic Party": "#1F4E79",
  "National Democratic Party of Germany": "#1F4E79",
  "Democratic Farmers' Party": "#4C9A2A",
  "Democratic Farmers' Party of Germany": "#4C9A2A",
  "Free German Trade Union Federation": "#F39200",
  "Free German Youth": "#005CA9",
  "Cultural Association": "#009999",
  "Cultural Association of the GDR": "#009999",
  "Democratic Women's League": "#92278F",
  "Democratic Women's League of Germany": "#92278F",
  "Peasants Mutual Aid Association": "#A9A400",
  "Union of Persecutees of the Nazi Regime": "#707070",
  "Cooperatives": "#9CA3AF",
  "Independents": "#9CA3AF",
  "National Front": "#8C8C8C",
  "Social Democratic Party": "#E3000F",
  "Social Democratic Party (East Berlin)": "#E3000F",
  "Social Democratic Party/SDA (East Berlin)": "#E3000F",
  "Party of Democratic Socialism": "#BE3075",
  "German Social Union": "#0033A0",
  "Democratic Awakening": "#6699CC",
  "Association of Free Democrats": "#FFCB05",
  "Alliance 90": "#46962B",
  "Green Party–Independent Women's Association": "#2E8B57",
  "United Left": "#9CA3AF",
};
export function ddPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ddEraOf(key: string) {
  return getDdElections().eras.find((e) => e.key === key) ?? null;
}
export function ddElectionById(id: string): DdLegElection | null {
  return getDdElections().elections.find((e) => e.id === id) ?? null;
}
export function ddNeighbours(id: string): { prev: DdLegElection | null; next: DdLegElection | null } {
  const els = getDdElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ddFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const ddFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type DdElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeDdRecords(): DdElectionRecord[] {
  const recs: DdElectionRecord[] = [];
  const els = getDdElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: ddFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: ddFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: ddFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: ddFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Highest list share", value: "99.95%", electionId: "1963", detail: "The National Front list's declared vote share, the highest of the nine near-unanimous elections from 1950 to 1986." });
  recs.push({ label: "Lowest list share", value: "66.07%", electionId: "1949", detail: "The founding Unity List's approval margin, the lowest the GDR would ever record, in the one election this hub treats separately from the National Front era." });
  recs.push({ label: "Lowest turnout", value: "93.38%", electionId: "1990", detail: "Turnout in the only free election fell short of every single-list ritual that came before it." });
  recs.push({ label: "Largest coalition total", value: "192 of 400", electionId: "1990", detail: "The Alliance for Germany's combined seats (CDU, German Social Union and Democratic Awakening), nine short of the 201 needed to govern alone." });
  return recs;
}
