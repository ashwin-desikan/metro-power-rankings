import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ClElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type ClLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: ClElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type ClPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type ClPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: ClPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type ClElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: ClPresElection[];
  legislative: ClLegElection[];
};

// ---------------- loader ----------------
let _core: ClElectionsFile | null = null;
export function getClElections(): ClElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "cl-elections.json"), "utf-8"),
  ) as ClElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Chilean party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Christian Democratic Party": "#00A0DC",
  "Socialist Party": "#E4002B",
  "Socialist Party of Chile": "#E4002B",
  "Communist Party": "#B10000",
  "Communist Party of Chile": "#B10000",
  "Party for Democracy": "#0F6FC6",
  "Social Democratic Radical Party": "#F2B701",
  "Radical Party": "#F2B701",
  "National Renewal": "#1B3F8B",
  "Independent Democratic Union": "#0033A0",
  "Republican Party": "#0A2A5E",
  "Evópoli": "#4CC3D9",
  "Frente Amplio": "#7B2D8B",
  "Broad Front": "#7B2D8B",
  "Democratic Revolution": "#7B2D8B",
  "Humanist Party": "#F26B21",
  "Liberal Party": "#F2A900",
  "National Party": "#1B3F8B",
  "Conservative Party": "#0033A0",
  "Party of the People": "#00A19A",
  "Green Ecologist Party": "#4CAF50",
  "Concertación": "#0F6FC6",
  "Popular Unity": "#E4002B",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
  "Yes": "#8D6E63",
  "No": "#E4002B",
};
export function clPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Christian Democrat/i.test(name)) return "#00A0DC";
  if (/Socialist/i.test(name)) return "#E4002B";
  if (/Communist/i.test(name)) return "#B10000";
  if (/Radical/i.test(name)) return "#F2B701";
  if (/National Renewal|Independent Democratic Union|Republican/i.test(name)) return "#1B3F8B";
  if (/Frente Amplio|Broad Front|Democratic Revolution/i.test(name)) return "#7B2D8B";
  if (/Liberal/i.test(name)) return "#F2A900";
  if (/Conservative|National Party/i.test(name)) return "#0033A0";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function clLegEraOf(key: string) {
  return getClElections().legEras.find((e) => e.key === key) ?? null;
}
export function clPresEraOf(key: string) {
  return getClElections().presEras.find((e) => e.key === key) ?? null;
}
export function clElectionById(id: string): ClLegElection | ClPresElection | null {
  const f = getClElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function clLegNeighbours(id: string): { prev: ClLegElection | null; next: ClLegElection | null } {
  const els = getClElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function clPresNeighbours(id: string): { prev: ClPresElection | null; next: ClPresElection | null } {
  const els = getClElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const clFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-CL"));
export const clFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows this
// atlas labels unfree, are excluded where including them would flatter the
// number rather than explain it.
export type ClElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeClRecords(): ClElectionRecord[] {
  const { presidential, legislative } = getClElections();
  const pres = presidential.filter((e) => e.unfree !== "unfree");
  const recs: ClElectionRecord[] = [];
  const withTurnout = pres.filter((e) => e.turnout != null && (e.turnout ?? 0) <= 100);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: clFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}` });
    recs.push({ label: "Lowest presidential turnout", value: clFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
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
    recs.push({ label: "Narrowest win", value: clFmtPct(close.share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  const seated = legislative.filter((e) => e.unfree !== "unfree").flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (seated.length) {
    const haul = seated.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: clFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Years without a national vote", value: "16", electionId: "pres-1988", detail: "1973 to 1989; the 1988 plebiscite is the only entry between them" });
  recs.push({ label: "Indirect presidential elections", value: "24", electionId: "pres-1920", detail: "1826 to 1920, all decided by colleges of electors" });
  return recs;
}
