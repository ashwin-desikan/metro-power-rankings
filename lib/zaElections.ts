import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ZaElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null;
};
export type ZaElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null; // percent (of the restricted rolls before 1994)
  parties: ZaElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // head of government
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null; // franchise framing for the pre-1994 contests
};
export type ZaElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: ZaElection[];
};

// ---------------- loader ----------------
let _core: ZaElectionsFile | null = null;
export function getZaElections(): ZaElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "za-elections.json"), "utf-8"),
  ) as ZaElectionsFile);
}

// ---------------- party colors ----------------
// Conventional South African party colors; names always accompany the color.
const P: Record<string, string> = {
  ANC: "#1B7A43", "African National Congress": "#1B7A43",
  DA: "#005BAA", "Democratic Alliance": "#005BAA", "Democratic Party": "#005BAA",
  MK: "#8A6D1D", "uMkhonto weSizwe": "#8A6D1D",
  EFF: "#C8102E", "Economic Freedom Fighters": "#C8102E",
  IFP: "#7A0C0C", "Inkatha Freedom Party": "#7A0C0C",
  "National Party": "#E87722", NP: "#E87722", "Herenigde Nasionale Party": "#E87722",
  "Reunited National": "#E87722", "New National Party": "#E87722", "Purified National Party": "#E87722",
  "Gesuiwerde Nasionale Party": "#E87722",
  "United Party": "#4A7BC8", "South African Party": "#4A7BC8", Unionist: "#3D6CB0",
  "Labour Party": "#B03060", Labour: "#B03060",
  "Progressive Party": "#F9C74F", "Progressive Federal Party": "#F9C74F", "Progressive Reform Party": "#F9C74F",
  "Conservative Party": "#274690", "Herstigte Nasionale Party": "#A3541B",
  "Afrikaner Party": "#C77B2F", Dominion: "#5B7DB1", "Dominion Party": "#5B7DB1",
  "Freedom Front Plus": "#6B8E23", "Freedom Front": "#6B8E23", "VF Plus": "#6B8E23",
  ACDP: "#3E5C76", "African Christian Democratic Party": "#3E5C76",
  COPE: "#FFC20E", "Congress of the People": "#FFC20E",
  UDM: "#2A9D8F", "United Democratic Movement": "#2A9D8F",
  ActionSA: "#00A651", "Patriotic Alliance": "#0B7285", GOOD: "#E76F51",
  "Pan Africanist Congress": "#0B5D3E", PAC: "#0B5D3E",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function zaPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Nasionale|National/i.test(name)) return "#E87722";
  if (/African National/i.test(name)) return "#1B7A43";
  if (/Progressive/i.test(name)) return "#F9C74F";
  if (/Labour/i.test(name)) return "#B03060";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function zaEraOf(key: string) {
  return getZaElections().eras.find((e) => e.key === key) ?? null;
}
export function zaElectionById(id: string): ZaElection | null {
  return getZaElections().elections.find((e) => e.id === id) ?? null;
}
export function zaNeighbours(id: string): { prev: ZaElection | null; next: ZaElection | null } {
  const els = getZaElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const zaFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-ZA"));
export const zaFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives. Democratic-era only for the participation and
// mandate records — pre-1994 figures describe a racially restricted roll.
export type ZaElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeZaRecords(): ZaElectionRecord[] {
  const all = getZaElections().elections;
  const dem = all.filter((e) => e.year >= 1994);
  const recs: ZaElectionRecord[] = [];
  const withTurnout = dem.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest democratic turnout", value: zaFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest democratic turnout", value: zaFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const demShare = dem
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (demShare.length) {
    const top = demShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest democratic vote share", value: zaFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const demSeats = dem
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (demSeats.length) {
    const haul = demSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: zaFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  const npWins = all.filter((e) => e.year >= 1948 && e.year <= 1989).length;
  recs.push({ label: "Whites-only elections under apartheid", value: String(npWins), electionId: "1948", detail: "1948–1989, all won by the National Party" });
  recs.push({ label: "First fully free election", value: "1994", electionId: "1994", detail: "the first vote open to all adult South Africans" });
  return recs;
}
