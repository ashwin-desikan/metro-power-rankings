import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type IrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type IrLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: IrElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type IrPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type IrPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: IrPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type IrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: IrPresElection[];
  legislative: IrLegElection[];
};

// ---------------- loader ----------------
let _core: IrElectionsFile | null = null;
export function getIrElections(): IrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ir-elections.json"), "utf-8"),
  ) as IrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Iranian party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Islamic Republican Party": "#1B7A3D",
  "Combatant Clergy Association": "#2E7D32",
  "Association of Combatant Clerics": "#1565C0",
  "Coalition Council of Islamic Revolution Forces": "#2E7D32",
  "People's Alliance of Islamic Revolution": "#4E7A3A",
  "Voice of the Nation": "#1565C0",
  "Unity Council": "#5C6BC0",
  "List of Hope": "#1565C0",
  "Principlists Grand Coalition": "#2E7D32",
  "United Front of Principlists": "#2E7D32",
  "Reformists Front": "#1565C0",
  "People's Voice Coalition": "#42A5F5",
  "Justice Discourse": "#8D6E63",
  "Principlists": "#2E7D32",
  "Reformists": "#1565C0",
  "Rastakhiz Party": "#B8860B",
  "New Iran Party": "#C69C33",
  "Party of Nationalists": "#8D6E63",
  "National Front": "#00838F",
  "Tudeh Party of Iran": "#B10000",
  "Revival Party": "#795548",
  "Appointed seats": "#78909C",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
};
export function irPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Rastakhiz|New Iran/i.test(name)) return "#B8860B";
  if (/Principlist|Combatant Clergy|Islamic Revolution Forces/i.test(name)) return "#2E7D32";
  if (/Reformist|List of Hope|Combatant Clerics|Voice of the Nation/i.test(name)) return "#1565C0";
  if (/Tudeh/i.test(name)) return "#B10000";
  if (/National Front/i.test(name)) return "#00838F";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function irLegEraOf(key: string) {
  return getIrElections().legEras.find((e) => e.key === key) ?? null;
}
export function irPresEraOf(key: string) {
  return getIrElections().presEras.find((e) => e.key === key) ?? null;
}
export function irElectionById(id: string): IrLegElection | IrPresElection | null {
  const f = getIrElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function irLegNeighbours(id: string): { prev: IrLegElection | null; next: IrLegElection | null } {
  const els = getIrElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function irPresNeighbours(id: string): { prev: IrPresElection | null; next: IrPresElection | null } {
  const els = getIrElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const irFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fa-IR"));
export const irFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows this
// atlas labels unfree, are excluded where including them would flatter the
// number rather than explain it.
export type IrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeIrRecords(): IrElectionRecord[] {
  const { presidential, legislative } = getIrElections();
  const pres = presidential.filter((e) => e.unfree !== "unfree");
  const recs: IrElectionRecord[] = [];
  const withTurnout = pres.filter((e) => e.turnout != null && (e.turnout ?? 0) <= 100);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: irFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}` });
    recs.push({ label: "Lowest presidential turnout", value: irFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
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
    recs.push({ label: "Narrowest win", value: irFmtPct(close.share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  const seated = legislative.filter((e) => e.unfree !== "unfree").flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (seated.length) {
    const haul = seated.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: irFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Seats to one party in 1975", value: "268", electionId: "1975", detail: "every seat in the Majlis, to the only legal party in the country" });
  recs.push({ label: "Presidential turnout, 1997 to 2024", value: "80% to 40%", electionId: "pres-2024", detail: "Khatami drew four in five voters; the 2024 snap election drew two in five" });
  return recs;
}
