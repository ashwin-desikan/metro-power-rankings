import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type IeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type IeLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: IeElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type IePresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type IePresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: IePresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type IeElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: IePresElection[];
  legislative: IeLegElection[];
};

// ---------------- loader ----------------
let _core: IeElectionsFile | null = null;
export function getIeElections(): IeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ie-elections.json"), "utf-8"),
  ) as IeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Irelandian party colors; names always accompany the color.
const P: Record<string, string> = {
  "Fianna Fáil": "#66BB66",
  "Fine Gael": "#6699FF",
  "Cumann na nGaedheal": "#6699FF",
  "Labour": "#CC0000",
  "Labour Party": "#CC0000",
  "Sinn Féin": "#326760",
  "Green": "#22AA22",
  "Green Party": "#22AA22",
  "Social Democrats": "#752F8B",
  "Independent Ireland": "#E85D26",
  "Aontú": "#44532A",
  "PBP–Solidarity": "#8E2420",
  "AAA–PBP": "#8E2420",
  "Solidarity–PBP": "#8E2420",
  "People Before Profit": "#8E2420",
  "Socialist Party": "#A00000",
  "Progressive Democrats": "#008685",
  "Clann na Poblachta": "#5A8F5A",
  "Clann na Talmhan": "#8B6C42",
  "Workers' Party": "#B22222",
  "Democratic Left": "#B22222",
  "Renua": "#4C338C",
  "Inds. 4 Change": "#7F8C8D",
  "Independents 4 Change": "#7F8C8D",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
  "Others": "#9ca3af",
};
export function iePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ieLegEraOf(key: string) {
  return getIeElections().legEras.find((e) => e.key === key) ?? null;
}
export function iePresEraOf(key: string) {
  return getIeElections().presEras.find((e) => e.key === key) ?? null;
}
export function ieElectionById(id: string): IeLegElection | IePresElection | null {
  const f = getIeElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function ieLegNeighbours(id: string): { prev: IeLegElection | null; next: IeLegElection | null } {
  const els = getIeElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function iePresNeighbours(id: string): { prev: IePresElection | null; next: IePresElection | null } {
  const els = getIeElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ieFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IE"));
export const ieFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives. Contests with no result on file, and the rows
// this atlas labels unfree, are excluded where including them would flatter
// the number rather than explain it.
export type IeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeIeRecords(): IeElectionRecord[] {
  const { presidential } = getIeElections();
  const recs: IeElectionRecord[] = [];
  const direct = presidential.filter((e) => (e.year >= 1945 && e.year <= 1960) || e.year >= 1989);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: ieFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  const runoffs = presidential
    .filter((e) => e.year >= 1989)
    .map((e) => {
      const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (runoffs.length) {
    const close = runoffs.reduce((a, b) => ((a.w.r2Share ?? 100) <= (b.w.r2Share ?? 100) ? a : b));
    const big = runoffs.reduce((a, b) => ((a.w.r2Share ?? 0) >= (b.w.r2Share ?? 0) ? a : b));
    recs.push({ label: "Closest runoff", value: ieFmtPct(close.w.r2Share), electionId: close.e.id, detail: `${close.w.name}, ${close.e.label}` });
    recs.push({ label: "Biggest runoff win", value: ieFmtPct(big.w.r2Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const r1 = direct
    .flatMap((e) => e.candidates.map((c) => ({ e, c })))
    .filter((x) => x.c.r1Votes != null);
  if (r1.length) {
    const most = r1.reduce((a, b) => ((a.c.r1Votes ?? 0) >= (b.c.r1Votes ?? 0) ? a : b));
    recs.push({ label: "Most first-round votes", value: ieFmtInt(most.c.r1Votes), electionId: most.e.id, detail: `${most.c.name}, ${most.e.label}` });
  }
  recs.push({ label: "Workers' Party runoff appearances", value: String(presidential.filter((e) => e.year >= 1989 && e.candidates.some((c) => c.r2Share != null && /PT|Workers/.test(c.party ?? ""))).length), electionId: "pres-2002", detail: "every runoff since redemocratisation has featured the PT" });
  return recs;
}
