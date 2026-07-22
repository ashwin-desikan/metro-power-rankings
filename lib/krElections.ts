import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type KrElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type KrLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: KrElectionParty[];
  pmBefore: { name: string; party: string | null } | null; // sitting president
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type KrPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type KrPresElection = {
  id: string; // "pres-YYYY" or "pres-1960-mar"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: KrPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type KrElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: KrPresElection[];
  legislative: KrLegElection[];
};

// ---------------- loader ----------------
let _core: KrElectionsFile | null = null;
export function getKrElections(): KrElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "kr-elections.json"), "utf-8"),
  ) as KrElectionsFile);
}

// ---------------- party colors ----------------
// Conventional South Korean party colors (the camps swapped colors around
// 2012: conservatives now red, liberals blue); names always accompany them.
const P: Record<string, string> = {
  "People Power Party": "#E61E2B", "People Power": "#E61E2B", PPP: "#E61E2B",
  Saenuri: "#C9151E", "Saenuri Party": "#C9151E", "Free Korea Party": "#C9151E", "Liberty Korea Party": "#C9151E",
  "Democratic Party": "#004EA2", "Democratic Party of Korea": "#004EA2", Minjoo: "#004EA2",
  "Democratic United Party": "#004EA2", "New Politics Alliance for Democracy": "#004EA2",
  "Grand National Party": "#0D4A8F", "New Korea Party": "#0D4A8F",
  "Democratic Liberal Party": "#1D5DA8", "Democratic Justice Party": "#2E5C9E",
  "Democratic Republican Party": "#557A46", "Liberal Party": "#4A7BC8",
  "Millennium Democratic Party": "#04709D", "United New Democratic Party": "#FF7210",
  "Uri Party": "#FFD400", "New Millennium Democratic": "#04709D",
  "National Congress for New Politics": "#04709D", "Peace Democratic Party": "#0A6E3F",
  "Reunification Democratic Party": "#1D9BF0", "New Democratic Party": "#2364AA",
  "New Democratic Republican Party": "#557A46", "Unified Democratic Party": "#1D9BF0",
  "Justice Party": "#FFCC00", "People's Party": "#01A69C", "Rebuilding Korea Party": "#0073CF",
  "New Reform Party": "#FF7210", "Democratic Labor Party": "#F26522",
  "Korea Democratic Party": "#2364AA", "Democratic Nationalist Party": "#8D6E63",
  "National Association": "#8D6E63", "Korea Nationalist Party": "#8D6E63",
  "New Frontier Party": "#C9151E", "Party for Peace and Democracy": "#0A6E3F",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function krPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/People Power|Saenuri|Liberty Korea|New Frontier/i.test(name)) return "#E61E2B";
  if (/Grand National|New Korea/i.test(name)) return "#0D4A8F";
  if (/Democratic Republican/i.test(name)) return "#557A46";
  if (/Justice/i.test(name)) return "#FFCC00";
  if (/Democratic|Minjoo|Minju/i.test(name)) return "#004EA2";
  if (/Liberal/i.test(name)) return "#4A7BC8";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function krLegEraOf(key: string) {
  return getKrElections().legEras.find((e) => e.key === key) ?? null;
}
export function krPresEraOf(key: string) {
  return getKrElections().presEras.find((e) => e.key === key) ?? null;
}
export function krElectionById(id: string): KrLegElection | KrPresElection | null {
  const f = getKrElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function krLegNeighbours(id: string): { prev: KrLegElection | null; next: KrLegElection | null } {
  const els = getKrElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function krPresNeighbours(id: string): { prev: KrPresElection | null; next: KrPresElection | null } {
  const els = getKrElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const krFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ko-KR"));
export const krFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the democratic era (1987 onward for the
// presidency, 1988 for the Assembly); the authoritarian rituals are excluded.
export type KrElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeKrRecords(): KrElectionRecord[] {
  const { presidential, legislative } = getKrElections();
  const recs: KrElectionRecord[] = [];
  const dem = presidential.filter((e) => e.year >= 1987);
  const withTurnout = dem.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest democratic turnout", value: krFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
    recs.push({ label: "Lowest democratic turnout", value: krFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} presidential election` });
  }
  const winners = dem
    .map((e) => {
      const w = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (winners.length) {
    const close = winners
      .map(({ e, w }) => {
        const ru = e.candidates.filter((c) => c.r1Share != null && c.name !== w.name).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
        return ru ? { e, gap: (w.r1Share ?? 0) - (ru.r1Share ?? 0), w, ru } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .reduce((a, b) => (a.gap <= b.gap ? a : b));
    recs.push({ label: "Closest race", value: `${close.gap.toFixed(2)} pts`, electionId: close.e.id, detail: `${close.w.name} over ${close.ru.name}, ${close.e.label}` });
    const big = winners.reduce((a, b) => ((a.w.r1Share ?? 0) >= (b.w.r1Share ?? 0) ? a : b));
    recs.push({ label: "Biggest democratic win", value: krFmtPct(big.w.r1Share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
  }
  recs.push({ label: "Presidents elected by rubber stamp", value: "5", electionId: "pres-1972", detail: "the unopposed Yushin and Fifth Republic rituals, 1972–1981" });
  const demLeg = legislative.filter((e) => e.year >= 1988);
  if (demLeg.length) {
    recs.push({ label: "Democratic Assembly elections", value: String(demLeg.length), electionId: "1988", detail: "since 1988 — frequently won by the president's opponents" });
  }
  return recs;
}
