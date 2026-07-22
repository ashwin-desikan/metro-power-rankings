import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PlElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type PlLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: PlElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type PlPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PlPresElection = {
  id: string; // "pres-YYYY" — includes the Commonwealth's royal free elections
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PlPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type PlElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: PlPresElection[];
  legislative: PlLegElection[];
};

// ---------------- loader ----------------
let _core: PlElectionsFile | null = null;
export function getPlElections(): PlElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "pl-elections.json"), "utf-8"),
  ) as PlElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Polish party colors; names always accompany the color.
const P: Record<string, string> = {
  PiS: "#263778", "Law and Justice": "#263778", "United Right": "#263778",
  PO: "#FCA311", "Civic Platform": "#FCA311", "Civic Coalition": "#FCA311", KO: "#FCA311",
  "Third Way": "#00B5A0", "Poland 2050": "#00B5A0", PSL: "#1FA84F", "Polish People's Party": "#1FA84F",
  "The Left": "#D10A10", Lewica: "#D10A10", SLD: "#D10A10", "Democratic Left Alliance": "#D10A10",
  Confederation: "#122B45", Konfederacja: "#122B45", "Kukiz'15": "#5A5A66",
  "Modern": "#19A2DE", Nowoczesna: "#19A2DE",
  Solidarity: "#D10A10", "Solidarity Citizens' Committee": "#D10A10", "Solidarity Electoral Action": "#B01C2E", AWS: "#B01C2E",
  "Freedom Union": "#3E5C76", UW: "#3E5C76", "Democratic Union": "#3E5C76", UD: "#3E5C76",
  "Labour Union": "#C1440E", "Centre Agreement": "#37517E", KLD: "#748CAB",
  PZPR: "#8E0000", "Polish United Workers' Party": "#8E0000", "Front of National Unity": "#8E0000",
  "Polish Workers' Party": "#8E0000", "Democratic Bloc": "#8E0000", ZSL: "#4C7A3F", SD: "#748CAB",
  "Polish Socialist Party": "#C1121F", PPS: "#C1121F",
  "Popular National Union": "#26547C", "National Democracy": "#26547C", Endecja: "#26547C",
  'Polish People\'s Party "Piast"': "#1FA84F", 'Polish People\'s Party "Wyzwolenie"': "#4C7A3F",
  BBWR: "#37517E", "Nonpartisan Bloc": "#37517E", OZN: "#37517E", "Camp of National Unity": "#37517E",
  Sanacja: "#37517E", "Christian Democracy": "#6B9BD1",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function plPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Law and Justice/i.test(name)) return "#263778";
  if (/Civic/i.test(name)) return "#FCA311";
  if (/Left|Socialist/i.test(name)) return "#D10A10";
  if (/People's/i.test(name)) return "#1FA84F";
  if (/Workers|Communist|National Unity Front/i.test(name)) return "#8E0000";
  if (/National/i.test(name)) return "#26547C";
  if (/Solidarity/i.test(name)) return "#B01C2E";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function plLegEraOf(key: string) {
  return getPlElections().legEras.find((e) => e.key === key) ?? null;
}
export function plPresEraOf(key: string) {
  return getPlElections().presEras.find((e) => e.key === key) ?? null;
}
export function plElectionById(id: string): PlLegElection | PlPresElection | null {
  const f = getPlElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function plLegNeighbours(id: string): { prev: PlLegElection | null; next: PlLegElection | null } {
  const els = getPlElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function plPresNeighbours(id: string): { prev: PlPresElection | null; next: PlPresElection | null } {
  const els = getPlElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const plFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pl-PL"));
export const plFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the free contests; communist-era rituals and
// the constrained interwar votes are excluded.
export type PlElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePlRecords(): PlElectionRecord[] {
  const { presidential, legislative } = getPlElections();
  const recs: PlElectionRecord[] = [];
  const direct = presidential.filter((e) => e.year >= 1990);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: plFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  const runoffs = direct
    .map((e) => {
      const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (runoffs.length) {
    const close = runoffs.reduce((a, b) => ((a.w.r2Share ?? 100) <= (b.w.r2Share ?? 100) ? a : b));
    recs.push({ label: "Closest runoff", value: plFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
  }
  const free = legislative.filter((e) => e.year >= 1991);
  const withLegTurnout = free.filter((e) => e.turnout != null);
  if (withLegTurnout.length) {
    const hi = withLegTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest Sejm-election turnout", value: plFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} parliamentary election — a Third Republic record` });
  }
  const withShare = free
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest free-election vote share", value: plFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  recs.push({ label: "Royal free elections", value: "11", electionId: "pres-1573", detail: "the Commonwealth elected its kings, 1573–1764" });
  recs.push({ label: "Jaruzelski's 1989 margin", value: "1 vote", electionId: "pres-1989", detail: "elected president by the round-table parliament" });
  return recs;
}
