import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type NgElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type NgLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: NgElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type NgPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type NgPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: NgPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type NgElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: NgPresElection[];
  legislative: NgLegElection[];
};

// ---------------- loader ----------------
let _core: NgElectionsFile | null = null;
export function getNgElections(): NgElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ng-elections.json"), "utf-8"),
  ) as NgElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Nigerian party colors; names always accompany the color.
const P: Record<string, string> = {
  APC: "#1D9F49", "All Progressives Congress": "#1D9F49",
  PDP: "#D71920", "People's Democratic Party": "#D71920", "Peoples Democratic Party": "#D71920",
  LP: "#00843D", "Labour Party": "#00843D",
  NNPP: "#114B8B", "New Nigeria Peoples Party": "#114B8B",
  APGA: "#F9A825", "All Progressives Grand Alliance": "#F9A825",
  ANPP: "#0F52BA", "All Nigeria Peoples Party": "#0F52BA", APP: "#0F52BA", "All People's Party": "#0F52BA",
  AD: "#F4A259", "Alliance for Democracy": "#F4A259", ACN: "#37517E", "Action Congress of Nigeria": "#37517E",
  CPC: "#B01C2E", "Congress for Progressive Change": "#B01C2E", ACCORD: "#5A7D9A", Accord: "#5A7D9A",
  SDP: "#6FA8DC", "Social Democratic Party": "#6FA8DC",
  NRC: "#C1121F", "National Republican Convention": "#C1121F",
  NPN: "#37517E", "National Party of Nigeria": "#37517E",
  UPN: "#C0392B", "Unity Party of Nigeria": "#C0392B",
  NPP: "#1F7A33", "Nigerian People's Party": "#1F7A33",
  GNPP: "#7B2D8B", "Great Nigeria People's Party": "#7B2D8B",
  PRP: "#E76F51", "People's Redemption Party": "#E76F51",
  NPC: "#1F7A33", "Northern People's Congress": "#1F7A33",
  NCNC: "#B8860B", "National Council of Nigeria and the Cameroons": "#B8860B",
  "National Council of Nigerian Citizens": "#B8860B",
  AG: "#C0392B", "Action Group": "#C0392B", NNDP: "#8B5E3C",
  "Nigerian National Democratic Party": "#8B5E3C",
  NYM: "#4E8EC4", "Nigerian Youth Movement": "#4E8EC4",
  NEPU: "#8E0000", "Northern Elements Progressive Union": "#8E0000",
  UMBC: "#5BAA5B", NPF: "#6B4226", UNCP: "#3E5C76", "United Nigeria Congress Party": "#3E5C76",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function ngPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/All Progressives Congress/i.test(name)) return "#1D9F49";
  if (/Democratic/i.test(name)) return "#D71920";
  if (/Labour/i.test(name)) return "#00843D";
  if (/Progressive/i.test(name)) return "#0F52BA";
  if (/Northern/i.test(name)) return "#1F7A33";
  if (/National/i.test(name)) return "#B8860B";
  if (/Action/i.test(name)) return "#C0392B";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function ngLegEraOf(key: string) {
  return getNgElections().legEras.find((e) => e.key === key) ?? null;
}
export function ngPresEraOf(key: string) {
  return getNgElections().presEras.find((e) => e.key === key) ?? null;
}
export function ngElectionById(id: string): NgLegElection | NgPresElection | null {
  const f = getNgElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function ngLegNeighbours(id: string): { prev: NgLegElection | null; next: NgLegElection | null } {
  const els = getNgElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function ngPresNeighbours(id: string): { prev: NgPresElection | null; next: NgPresElection | null } {
  const els = getNgElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const ngFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-NG"));
export const ngFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the Fourth Republic (1999 onward); colonial,
// annulled and military-transition contests are excluded.
export type NgElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeNgRecords(): NgElectionRecord[] {
  const { presidential } = getNgElections();
  const fourth = presidential.filter((e) => e.year >= 1999);
  const recs: NgElectionRecord[] = [];
  const withTurnout = fourth.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest Fourth Republic turnout", value: ngFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
    recs.push({ label: "Lowest Fourth Republic turnout", value: ngFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} — a record low for a Nigerian presidential vote` });
  }
  const winners = fourth
    .map((e) => {
      const w = e.candidates
        .filter((c) => c.r1Share != null)
        .sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (winners.length) {
    const low = winners.reduce((a, b) => ((a.w.r1Share ?? 100) <= (b.w.r1Share ?? 100) ? a : b));
    recs.push({ label: "Lowest winning share", value: ngFmtPct(low.w.r1Share), electionId: low.e.id, detail: `${low.w.name}, ${low.e.label} — the first three-way contest` });
  }
  recs.push({ label: "June 12", value: "1993", electionId: "pres-1993", detail: "the annulled election is now Democracy Day; MKO Abiola never took office" });
  recs.push({ label: "An incumbent concedes", value: "2015", electionId: "pres-2015", detail: "Goodluck Jonathan's concession call was a first in Nigerian history" });
  recs.push({ label: "Africa's first colonial election", value: "1923", electionId: "1923", detail: "the Clifford Constitution's four elected Legislative Council seats" });
  return recs;
}
