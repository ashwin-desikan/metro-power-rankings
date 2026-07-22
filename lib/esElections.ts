import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type EsElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type EsElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: EsElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null; // turno pacífico and Francoist contests
};
export type EsElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: EsElection[];
};

// ---------------- loader ----------------
let _core: EsElectionsFile | null = null;
export function getEsElections(): EsElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "es-elections.json"), "utf-8"),
  ) as EsElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Spanish party colors; names always accompany the color.
const P: Record<string, string> = {
  PSOE: "#E4032E", "Spanish Socialist Workers' Party": "#E4032E",
  PP: "#1D84CE", "People's Party": "#1D84CE", "Popular Alliance": "#1D84CE", AP: "#1D84CE",
  UCD: "#79C142", "Union of the Democratic Centre": "#79C142",
  Vox: "#63BE21", Podemos: "#6A2E6F", "Unidas Podemos": "#6A2E6F", Sumar: "#E51C55",
  "Ciudadanos": "#EB6109", "Cs": "#EB6109",
  PCE: "#C1121F", "Communist Party of Spain": "#C1121F", IU: "#C1121F", "United Left": "#C1121F",
  CiU: "#18307B", "Convergence and Union": "#18307B", ERC: "#FFB232",
  PNV: "#008C45", "Basque Nationalist Party": "#008C45", "EH Bildu": "#B5CC18", Junts: "#00C3B2",
  CDS: "#77AC1C",
  Conservative: "#1E3A8A", "Conservative Party": "#1E3A8A", "Liberal-Conservative": "#1E3A8A",
  Liberal: "#F4A259", "Liberal Party": "#F4A259", "Liberal Fusionist": "#F4A259",
  "Constitutional Party": "#4E8EC4", "Moderate Party": "#37517E", "Progressive Party": "#F9C74F",
  "Sagasta Liberals": "#F4A259", "Radical Republican Party": "#E76F51",
  Republican: "#7B2D8B", "Federal Democratic Republican Party": "#7B2D8B",
  CEDA: "#2E5C9E", "Spanish Confederation of Autonomous Right-wing Groups": "#2E5C9E",
  "Republican Left": "#C1440E", IR: "#C1440E", "Republican Union": "#D46A6A", "Popular Front": "#D62839",
  PRR: "#E76F51", "Radical Party": "#E76F51", Carlist: "#8E0000", "Traditionalist Communion": "#8E0000",
  "Monarchist–Democratic": "#4A7BC8", Monarchist: "#7B3F00", "Renovación Española": "#37517E",
  "Unión Monárquica": "#7B3F00", Falange: "#0A2342",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function esPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Socialist/i.test(name)) return "#E4032E";
  if (/Communist/i.test(name)) return "#C1121F";
  if (/Conservative/i.test(name)) return "#1E3A8A";
  if (/Liberal/i.test(name)) return "#F4A259";
  if (/Republican/i.test(name)) return "#7B2D8B";
  if (/Carlist|Traditionalist/i.test(name)) return "#8E0000";
  if (/Monarch/i.test(name)) return "#7B3F00";
  if (/Catalan|Basque|Galician/i.test(name)) return "#008C45";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function esEraOf(key: string) {
  return getEsElections().eras.find((e) => e.key === key) ?? null;
}
export function esElectionById(id: string): EsElection | null {
  return getEsElections().elections.find((e) => e.id === id) ?? null;
}
export function esNeighbours(id: string): { prev: EsElection | null; next: EsElection | null } {
  const els = getEsElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const esFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-ES"));
export const esFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the democratic era (1977 onward) plus the
// Second Republic; arranged and Francoist contests are excluded.
export type EsElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeEsRecords(): EsElectionRecord[] {
  const els = getEsElections().elections.filter((e) => !e.caveat);
  const dem = els.filter((e) => e.year >= 1977);
  const recs: EsElectionRecord[] = [];
  const withTurnout = dem.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest democratic turnout", value: esFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest democratic turnout", value: esFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withSeats = dem
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: esFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  const withShare = dem
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: esFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  recs.push({ label: "Years between free elections", value: "41", electionId: "1977", detail: "from the Popular Front of 1936 to the transition's first vote" });
  const changes = dem.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of PM at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : dem[dem.length - 1].id,
    detail: `of ${dem.length} democratic elections since 1977`,
  });
  return recs;
}
