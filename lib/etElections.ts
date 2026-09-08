import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type EtElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type EtLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: EtElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type EtElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: EtLegElection[];
};

// ---------------- loader ----------------
let _core: EtElectionsFile | null = null;
export function getEtElections(): EtElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "et-elections.json"), "utf-8"),
  ) as EtElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Ethiopian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Independents": "#9ca3af",
  "Independent": "#9ca3af",
  "Workers' Party of Ethiopia": "#b91c1c",
  "Ethiopian People's Revolutionary Democratic Front": "#7c2d3f",
  "Amhara National Democratic Movement": "#ca8a04",
  "Tigray People's Liberation Front": "#dc2626",
  "Oromo People's Democratic Organization": "#16a34a",
  "Oromo Peoples' Democratic Organization": "#16a34a",
  "Southern Ethiopian People's Democratic Movement": "#0d9488",
  "Ethiopian Somali People's Democratic Party": "#0ea5e9",
  "Ethiopian Somali Democratic League": "#0369a1",
  "Coalition for Unity and Democracy": "#1d4ed8",
  "United Ethiopian Democratic Forces": "#7c3aed",
  "Afar National Democratic Party": "#f97316",
  "Afar Liberation Front": "#c2410c",
  "Benishangul-Gumuz People's Democratic Party": "#65a30d",
  "Benishangul-Gumuz People's Democratic Unity Front": "#65a30d",
  "Gambela People's Democratic Movement": "#14b8a6",
  "Gambela People's Liberation Movement": "#0e7490",
  "Argoba People's Democratic Organization": "#92400e",
  "Argoba Nationality Democratic Organization": "#92400e",
  "Argoba Nationality Democratic Movement": "#92400e",
  "Hareri National League": "#db2777",
  "Medrek": "#f59e0b",
  "Prosperity Party": "#15803d",
  "Ethiopian Citizens for Social Justice": "#8b5cf6",
  "National Movement of Amhara": "#eab308",
  "Amhara Democratic Force Movement": "#b45309",
  "New Generation Party": "#4f46e5",
  "Ogaden National Liberation Front": "#991b1b",
  "Gedeo People's Democratic Party": "#06b6d4",
  "Ethiopian National Unity Party": "#475569",
  "Ethiopian Democratic Party": "#e11d48",
  "Oromo Federalist Democratic Movement": "#059669",
  "Unity for Democracy and Justice": "#c026d3",
  "Western Somali Democratic Party": "#2563eb",
  "Western Somali Democratic League": "#2563eb",
  "Kebena Nationality Democratic Organization": "#78350f",
  "Wolayta People's Democratic Organization": "#0f766e",
  "Wolaita People's Democratic Movement": "#0f766e",
  "Sidama People's Democratic Organization": "#84cc16",
  "Gamo and Gofa People's Democratic Organization": "#22c55e",
  "Hadiya People's Democratic Organization": "#ec4899",
  "Yem People's Democratic Front": "#d97706",
  "Other parties": "#6b7280",
  "Afar People's Party": "#fb923c",
  "Freedom and Equality Party": "#0891b2",
};
export function etPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Somali.*(Democratic|Federalist|Liberation)/i.test(name)) return "#0284c7";
  if (/Afar.*(Democratic|People|Revolutionary|Liberation)/i.test(name)) return "#ea580c";
  if (/Amhara.*(Democratic|National|Unity)/i.test(name)) return "#ca8a04";
  if (/Oromo.*(Democratic|Liberation|Federalist|Congress)/i.test(name)) return "#16a34a";
  if (/Gambela.*(Democratic|Liberation|Unity)/i.test(name)) return "#0e7490";
  if (/Benishangul.*(Democratic|Unity|Liberation)/i.test(name)) return "#65a30d";
  if (/Gumuz.*(Democratic|Liberation)/i.test(name)) return "#65a30d";
  if (/People'?s'? (Democratic|Revolutionary Democratic) (Organization|Movement|Front|Party|Unity)/i.test(name)) return "#4d7c0f";
  if (/Democratic (Organization|Movement|Front|Party|League|Unity)/i.test(name)) return "#57534e";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function etEraOf(key: string) {
  return getEtElections().eras.find((e) => e.key === key) ?? null;
}
export function etElectionById(id: string): EtLegElection | null {
  return getEtElections().elections.find((e) => e.id === id) ?? null;
}
export function etNeighbours(id: string): { prev: EtLegElection | null; next: EtLegElection | null } {
  const els = getEtElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const etFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const etFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type EtElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeEtRecords(): EtElectionRecord[] {
  const recs: EtElectionRecord[] = [];
  const els = getEtElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: etFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: etFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: etFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: etFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Most seats won", value: "500", electionId: "2015", detail: "The EPRDF and its allies took every one of the 547 seats, a result international observers called neither free nor fair." });
  recs.push({ label: "Highest turnout", value: "95.7%", electionId: "2026", detail: "The reported turnout in the Prosperity Party's second election, held with Tigray excluded and 61 seats left vacant." });
  recs.push({ label: "Largest single-party win", value: "795 seats", electionId: "1987", detail: "The Workers' Party of Ethiopia's near-sweep of the Derg's 835-member National Shengo, the only legal party on the ballot." });
  recs.push({ label: "Most seats left vacant", value: "74", electionId: "2021", detail: "Fighting and logistics kept balloting from happening at all in 74 of the House's 547 seats, more than in any other election on record." });
  return recs;
}
