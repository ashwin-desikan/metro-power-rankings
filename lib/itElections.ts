import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ItElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type ItElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: ItElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null; // 1924, held under Fascist violence
  unfree?: "partial" | "unfree" | null; // the 1929/1934 plebiscites
};
export type ItElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: ItElection[];
};

// ---------------- loader ----------------
let _core: ItElectionsFile | null = null;
export function getItElections(): ItElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "it-elections.json"), "utf-8"),
  ) as ItElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Italian party colors; names always accompany the color.
const P: Record<string, string> = {
  "Christian Democracy": "#6B9BD1", DC: "#6B9BD1",
  "Italian Communist Party": "#C1121F", PCI: "#C1121F", "Communist Party": "#C1121F",
  "Italian Socialist Party": "#E75480", PSI: "#E75480", "Socialist Party": "#E75480",
  "Italian Social Democratic Party": "#F48FB1", PSDI: "#F48FB1",
  "Democratic Party": "#E4032E", PD: "#E4032E", "Democrats of the Left": "#E4032E", DS: "#E4032E",
  "Democratic Party of the Left": "#E4032E", PDS: "#E4032E", "The Olive Tree": "#7CB342", Ulivo: "#7CB342",
  "Brothers of Italy": "#1B3F8F", FdI: "#1B3F8F",
  Lega: "#3FA34D", "Lega Nord": "#3FA34D", "Northern League": "#3FA34D", League: "#3FA34D",
  "Five Star Movement": "#FFC700", M5S: "#FFC700",
  "Forza Italia": "#0087DC", FI: "#0087DC", "The People of Freedom": "#0087DC", PdL: "#0087DC",
  "House of Freedoms": "#0087DC", "Pole of Freedoms": "#0087DC",
  "Italian Social Movement": "#46464F", MSI: "#46464F", "National Alliance": "#37517E", AN: "#37517E",
  "National Fascist Party": "#514F59", "National List": "#514F59",
  "Italian Liberal Party": "#F9C74F", PLI: "#F9C74F", "Liberal Union": "#F4A259", Liberals: "#F4A259",
  "Italian Republican Party": "#74C365", PRI: "#74C365",
  "Italian People's Party": "#5FA8D3", PPI: "#5FA8D3", "Popular Party": "#5FA8D3",
  "Historical Right": "#1E3A8A", Right: "#1E3A8A", "Historical Left": "#B03A2E", Left: "#B03A2E",
  "Ministerial Left": "#B03A2E", "Dissident Left": "#C77B2F",
  "Common Man's Front": "#8A8F98", "Monarchist National Party": "#7B3F00", Monarchists: "#7B3F00",
  "Proletarian Democracy": "#A40000", "Communist Refoundation Party": "#A40000", PRC: "#A40000",
  "Action Party": "#2A9D8F", "Radical Party": "#F4A259", Radicals: "#F4A259",
  "Democracy is Freedom – The Daisy": "#5FA8D3", "The Daisy": "#5FA8D3",
  "Italy of Values": "#F58025", "Civic Choice": "#748CAB", "Democratic Centre": "#748CAB",
  "Action – Italia Viva": "#19A2DE", "Third Pole": "#19A2DE",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function itPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Communist/i.test(name)) return "#C1121F";
  if (/Socialist/i.test(name)) return "#E75480";
  if (/Christian Democracy|Christian Democratic/i.test(name)) return "#6B9BD1";
  if (/Fascist/i.test(name)) return "#514F59";
  if (/Democratic|Democrats/i.test(name)) return "#E4032E";
  if (/Right|Conservative/i.test(name)) return "#1E3A8A";
  if (/Left/i.test(name)) return "#B03A2E";
  if (/Liberal/i.test(name)) return "#F9C74F";
  if (/Monarch/i.test(name)) return "#7B3F00";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function itEraOf(key: string) {
  return getItElections().eras.find((e) => e.key === key) ?? null;
}
export function itElectionById(id: string): ItElection | null {
  return getItElections().elections.find((e) => e.id === id) ?? null;
}
export function itNeighbours(id: string): { prev: ItElection | null; next: ItElection | null } {
  const els = getItElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const itFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("it-IT"));
export const itFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives; the Fascist-era votes are excluded.
export type ItElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeItRecords(): ItElectionRecord[] {
  const els = getItElections().elections.filter((e) => !e.unfree && e.year !== 1924);
  const recs: ItElectionRecord[] = [];
  const republic = els.filter((e) => e.year >= 1946);
  const withTurnout = republic.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest republican turnout", value: itFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest republican turnout", value: itFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withShare = republic
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: itFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const dcRuns = republic.filter((e) => e.year <= 1992 && /Christian Democracy|DC/.test(e.seatLeader ?? "")).length;
  recs.push({ label: "Elections with DC the largest party", value: String(dcRuns), electionId: "1948", detail: "every election of the First Republic, 1946–1992" });
  const changes = republic.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of PM at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : republic[republic.length - 1].id,
    detail: "most Italian governments have changed between elections, not at them",
  });
  recs.push({ label: "Republic's first vote", value: "1946", electionId: "1946", detail: "women vote, and the monarchy falls the same day" });
  return recs;
}
