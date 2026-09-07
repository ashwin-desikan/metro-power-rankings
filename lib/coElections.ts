import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type CoElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type CoLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: CoElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CoPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type CoPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: CoPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type CoElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: CoPresElection[];
  legislative: CoLegElection[];
};

// ---------------- loader ----------------
let _core: CoElectionsFile | null = null;
export function getCoElections(): CoElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "co-elections.json"), "utf-8"),
  ) as CoElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Colombian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Colombian Liberal Party": "#C8102E",
  "Liberal": "#C8102E",
  "New Liberalism": "#E4572E",
  "Liberal Revolutionary Movement": "#E4572E",
  "Colombian Conservative Party": "#0033A0",
  "Conservative": "#0033A0",
  "Independent Conservatism": "#4169B2",
  "Conservative National Movement": "#4169B2",
  "National Popular Alliance": "#00838F",
  "Social Party of National Unity": "#F7A800",
  "Radical Change": "#D81B60",
  "Democratic Center": "#1B3F8B",
  "Democratic Centre": "#1B3F8B",
  "Alternative Democratic Pole": "#F4C430",
  "Patriotic Union": "#FFD100",
  "Historic Pact": "#E4002B",
  "Historic Pact for Colombia": "#E4002B",
  "Green Alliance": "#2E9E4F",
  "Colombian Communist Party": "#8B0000",
  "National Salvation Movement": "#6A5ACD",
  "Indigenous Authorities of Colombia": "#8D6E63",
  "Oficialistas": "#C8102E",
  "Unionistas": "#0033A0",
  "Frentenacionalistas": "#7E57C2",
  "Doctrinarios": "#3F51B5",
  "Pastranistas": "#0033A0",
  "Belisaristas": "#4169B2",
  "Lauro-Alzatistas": "#283593",
  "Others": "#9ca3af",
  "Independents": "#9ca3af",
};
export function coPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Liberal/i.test(name)) return "#C8102E";
  if (/Conservative/i.test(name)) return "#0033A0";
  if (/Historic Pact|Humane Colombia/i.test(name)) return "#E4002B";
  if (/Democratic Cent/i.test(name)) return "#1B3F8B";
  if (/Independen|Others/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function coLegEraOf(key: string) {
  return getCoElections().legEras.find((e) => e.key === key) ?? null;
}
export function coPresEraOf(key: string) {
  return getCoElections().presEras.find((e) => e.key === key) ?? null;
}
export function coElectionById(id: string): CoLegElection | CoPresElection | null {
  const f = getCoElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function coLegNeighbours(id: string): { prev: CoLegElection | null; next: CoLegElection | null } {
  const els = getCoElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function coPresNeighbours(id: string): { prev: CoPresElection | null; next: CoPresElection | null } {
  const els = getCoElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const coFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-CO"));
export const coFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows this
// atlas labels unfree, are excluded where including them would flatter the
// number rather than explain it.
export type CoElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeCoRecords(): CoElectionRecord[] {
  const { presidential, legislative } = getCoElections();
  const pres = presidential.filter((e) => e.unfree !== "unfree");
  const recs: CoElectionRecord[] = [];
  const withTurnout = pres.filter((e) => e.turnout != null && (e.turnout ?? 0) <= 100);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: coFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}` });
    recs.push({ label: "Lowest presidential turnout", value: coFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const decided = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (decided.length) {
    const close = decided.reduce((a, b) => (a.share <= b.share ? a : b));
    recs.push({ label: "Narrowest win", value: coFmtPct(close.share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  const seated = legislative.filter((e) => e.unfree !== "unfree").flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (seated.length) {
    const haul = seated.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: coFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "National Front contests", value: "4", electionId: "pres-1970", detail: "1958 to 1974, with the presidency alternating by written pact" });
  recs.push({ label: "Elections decided by the states", value: "11", electionId: "pres-1875", detail: "1860 to 1884, nine states with one vote each and no popular ballot" });
  return recs;
}
