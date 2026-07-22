import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type IdElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type IdLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: IdElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type IdPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type IdPresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: IdPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type IdElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: IdPresElection[];
  legislative: IdLegElection[];
};

// ---------------- loader ----------------
let _core: IdElectionsFile | null = null;
export function getIdElections(): IdElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "id-elections.json"), "utf-8"),
  ) as IdElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Indonesian party colors; names always accompany the color.
const P: Record<string, string> = {
  Golkar: "#F5C400", "Golongan Karya": "#F5C400",
  "PDI-P": "#DB2016", "Indonesian Democratic Party of Struggle": "#DB2016",
  "Indonesian Democratic Party": "#B03A2E", PDI: "#B03A2E",
  Gerindra: "#A6362C", "Great Indonesia Movement Party": "#A6362C",
  PKB: "#146A5D", "National Awakening Party": "#146A5D",
  PPP: "#006B3F", "United Development Party": "#006B3F",
  PAN: "#29ABE2", "National Mandate Party": "#29ABE2",
  Demokrat: "#2643A3", "Democratic Party": "#2643A3",
  PKS: "#F7941D", "Prosperous Justice Party": "#F7941D",
  NasDem: "#003D79", "NasDem Party": "#003D79",
  Hanura: "#B03060", "Crescent Star Party": "#0B5D3E",
  "Indonesian National Party": "#B03A2E", PNI: "#B03A2E",
  "Masyumi Party": "#1B4332", Masyumi: "#1B4332",
  "Nahdlatul Ulama": "#146A5D", NU: "#146A5D",
  "Communist Party of Indonesia": "#A40000", PKI: "#A40000",
  "Indonesian Islamic Union Party": "#0B5D3E", PSII: "#0B5D3E",
  "Socialist Party of Indonesia": "#C77DFF", PSI: "#C77DFF",
  "Indonesian Christian Party": "#4E8EC4", "Catholic Party": "#5B7DB1", Parmusi: "#0B5D3E",
  "Islamic Education Movement": "#0B5D3E", Perti: "#0B5D3E",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function idPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Golkar|Golongan/i.test(name)) return "#F5C400";
  if (/Struggle/i.test(name)) return "#DB2016";
  if (/Islam|Muslim|Ulama|Crescent/i.test(name)) return "#0B5D3E";
  if (/Communist/i.test(name)) return "#A40000";
  if (/National/i.test(name)) return "#B03A2E";
  if (/Christian|Catholic/i.test(name)) return "#4E8EC4";
  if (/Socialist/i.test(name)) return "#C77DFF";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function idLegEraOf(key: string) {
  return getIdElections().legEras.find((e) => e.key === key) ?? null;
}
export function idPresEraOf(key: string) {
  return getIdElections().presEras.find((e) => e.key === key) ?? null;
}
export function idElectionById(id: string): IdLegElection | IdPresElection | null {
  const f = getIdElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function idLegNeighbours(id: string): { prev: IdLegElection | null; next: IdLegElection | null } {
  const els = getIdElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function idPresNeighbours(id: string): { prev: IdPresElection | null; next: IdPresElection | null } {
  const els = getIdElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const idFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("id-ID"));
export const idFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the free elections (1955 and 1999 onward).
export type IdElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeIdRecords(): IdElectionRecord[] {
  const { presidential, legislative } = getIdElections();
  const recs: IdElectionRecord[] = [];
  const direct = presidential.filter((e) => e.year >= 2004);
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest direct-election turnout", value: idFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
  }
  const winners = direct
    .map((e) => {
      const w = e.candidates.filter((c) => (c.r2Share ?? c.r1Share) != null).sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (((a.w.r2Share ?? a.w.r1Share) ?? 0) >= ((b.w.r2Share ?? b.w.r1Share) ?? 0) ? a : b));
    recs.push({ label: "Biggest direct-election win", value: idFmtPct(big.w.r2Share ?? big.w.r1Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  const free = legislative.filter((e) => !e.caveat);
  const withShare = free
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest free-election vote share", value: idFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  recs.push({ label: "Voters in 2024", value: "~205m", electionId: "pres-2024", detail: "the largest single-day election ever held" });
  recs.push({ label: "Years between free elections", value: "44", electionId: "1999", detail: "from the 1955 experiment to the reformasi vote of 1999" });
  recs.push({ label: "Managed New Order victories", value: "6", electionId: "1971", detail: "Golkar won every election it staged, 1971–1997" });
  return recs;
}
