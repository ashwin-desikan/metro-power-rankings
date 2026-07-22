import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type TrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type TrLegElection = {
  id: string; // year, plus "1877-1"/"1877-2"/"2015-jun"/"2015-nov"
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: TrElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type TrPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type TrPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: TrPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type TrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: TrPresElection[];
  legislative: TrLegElection[];
};

// ---------------- loader ----------------
let _core: TrElectionsFile | null = null;
export function getTrElections(): TrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "tr-elections.json"), "utf-8"),
  ) as TrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Turkish party colors; names always accompany the color.
const P: Record<string, string> = {
  "AK Party": "#FDA000", AKP: "#FDA000", "Justice and Development Party": "#FDA000",
  CHP: "#E30A17", "Republican People's Party": "#E30A17",
  MHP: "#8B0000", "Nationalist Movement Party": "#8B0000",
  "İYİ Party": "#0099CC", "Good Party": "#0099CC",
  HDP: "#7B2D8B", "Peoples' Democratic Party": "#7B2D8B", DEM: "#7B2D8B", "DEM Party": "#7B2D8B",
  "Green Left Party": "#5BAA5B", YSP: "#5BAA5B",
  DP: "#E3B505", "Democrat Party": "#E3B505", "Democratic Party": "#E3B505",
  AP: "#C0392B", "Justice Party": "#C0392B",
  DYP: "#C0392B", "True Path Party": "#C0392B",
  ANAP: "#F9A825", "Motherland Party": "#F9A825",
  DSP: "#E85D75", "Democratic Left Party": "#E85D75",
  SHP: "#D10A10", "Social Democratic Populist Party": "#D10A10",
  RP: "#007A3D", "Welfare Party": "#007A3D", FP: "#007A3D", "Virtue Party": "#007A3D",
  SP: "#1F7A33", "Felicity Party": "#1F7A33", "National Salvation Party": "#1F7A33", MSP: "#1F7A33",
  CGP: "#4E8EC4", "Republican Reliance Party": "#4E8EC4",
  TİP: "#B01C2E", "Workers' Party of Turkey": "#B01C2E",
  CUP: "#8B5E3C", "Committee of Union and Progress": "#8B5E3C",
  "Freedom and Accord Party": "#4E8EC4", "Freedom and Accord": "#4E8EC4",
  ARMHC: "#E30A17", "New Turkey Party": "#37517E", "Nation Party": "#37517E",
  "Free Republican Party": "#6FA8DC",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function trPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Justice and Development|AK /i.test(name)) return "#FDA000";
  if (/Republican People|People's Party/i.test(name)) return "#E30A17";
  if (/Nationalist/i.test(name)) return "#8B0000";
  if (/Democratic Left/i.test(name)) return "#E85D75";
  if (/Welfare|Virtue|Felicity|Salvation/i.test(name)) return "#007A3D";
  if (/Union and Progress/i.test(name)) return "#8B5E3C";
  if (/Democrat/i.test(name)) return "#E3B505";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function trLegEraOf(key: string) {
  return getTrElections().legEras.find((e) => e.key === key) ?? null;
}
export function trPresEraOf(key: string) {
  return getTrElections().presEras.find((e) => e.key === key) ?? null;
}
export function trElectionById(id: string): TrLegElection | TrPresElection | null {
  const f = getTrElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function trLegNeighbours(id: string): { prev: TrLegElection | null; next: TrLegElection | null } {
  const els = getTrElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function trPresNeighbours(id: string): { prev: TrPresElection | null; next: TrPresElection | null } {
  const els = getTrElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const trFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("tr-TR"));
export const trFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the multiparty era (1950 onward); the
// single-party rituals and constrained votes are excluded where misleading.
export type TrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeTrRecords(): TrElectionRecord[] {
  const { legislative, presidential } = getTrElections();
  const multi = legislative.filter((e) => e.year >= 1950 && !["1983"].includes(e.id));
  const recs: TrElectionRecord[] = [];
  const withTurnout = multi.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: trFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest turnout", value: trFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withShare = multi
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: trFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const direct = presidential.filter((e) => e.year >= 2014);
  const withPresTurnout = direct.filter((e) => (e.turnout2 ?? e.turnout) != null);
  if (withPresTurnout.length) {
    const hi = withPresTurnout.reduce((a, b) => (((a.turnout2 ?? a.turnout) ?? 0) >= ((b.turnout2 ?? b.turnout) ?? 0) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: trFmtPct(hi.turnout2 ?? hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  recs.push({ label: "The Muslim world's first parliament", value: "1877", electionId: "1877-1", detail: "the Ottoman Chamber of Deputies, elected twice in one year" });
  recs.push({ label: "Ballots in the failed 1980 election", value: "100+", electionId: "pres-1980", detail: "six months of deadlock, ended by the September coup" });
  return recs;
}
