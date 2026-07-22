import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ArPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type ArPresElection = {
  id: string; // year, plus "1973-mar" / "1973-sep"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: ArPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type ArElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: ArPresElection[];
};

// ---------------- loader ----------------
let _core: ArElectionsFile | null = null;
export function getArElections(): ArElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ar-elections.json"), "utf-8"),
  ) as ArElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Argentine party colors; names always accompany the color.
const P: Record<string, string> = {
  PJ: "#009CDE", "Justicialist Party": "#009CDE", "Peronist Party": "#009CDE", "Labour Party": "#009CDE",
  FREJULI: "#009CDE", "Front for Victory": "#29ABE2", "FPV-PJ": "#29ABE2", FPV: "#29ABE2",
  "Frente de Todos": "#009CDE", "FDT–PJ": "#009CDE", "Union for the Homeland": "#009CDE",
  UCR: "#D40000", "Radical Civic Union": "#D40000", UCRP: "#D40000", "Unionist Radical Civic Union": "#D40000",
  UCRI: "#C0392B", "Intransigent Radical Civic Union": "#C0392B",
  "La Libertad Avanza": "#753BBD", "Freedom Advances": "#753BBD", "LLA–PL": "#753BBD",
  Cambiemos: "#FFC20E", "Cambiemos–PRO": "#FFC20E", PRO: "#FFC20E", "Together for Change": "#FFC20E",
  "Juntos por el Cambio": "#FFC20E",
  "National Autonomist Party": "#26547C", PAN: "#26547C", "National Party": "#26547C",
  "Federalist Party": "#C1121F", Federalist: "#C1121F",
  "Unitarian Party": "#4E8EC4", Unitarian: "#4E8EC4", "Liberal Party": "#4E8EC4", "Nationalist Party": "#37517E",
  Concordancia: "#37517E", UCRA: "#37517E", "National Democratic Party": "#37517E",
  Conservative: "#1E3A8A", "National Concentration": "#1E3A8A", Confederation: "#1E3A8A",
  PDP: "#7B2D8B", "Progressive Democratic Party": "#7B2D8B",
  UCEDE: "#1F4E79", UDELPA: "#3E5C76", "Union of the Democratic Centre": "#1F4E79",
  FREPASO: "#6A2E6F", "Alliance for Work, Justice and Education": "#E10019", PAIS: "#5A7D9A",
  "United for a New Alternative": "#00A5A8", "Socialist Party": "#C1121F", Recreate: "#F4A259",
  "Consenso Federal": "#5A7D9A", Independent: "#6b7280", Others: "#9ca3af",
};
export function arPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Justicialis|Peronis|Homeland|Victory|Todos/i.test(name)) return "#009CDE";
  if (/Radical/i.test(name)) return "#D40000";
  if (/Libert/i.test(name)) return "#753BBD";
  if (/Cambi|PRO/i.test(name)) return "#FFC20E";
  if (/Autonomist/i.test(name)) return "#26547C";
  if (/Federalist/i.test(name)) return "#C1121F";
  if (/Unitarian|Liberal/i.test(name)) return "#4E8EC4";
  if (/Socialis/i.test(name)) return "#C1121F";
  if (/Conservative|Democratic Party/i.test(name)) return "#1E3A8A";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function arEraOf(key: string) {
  return getArElections().eras.find((e) => e.key === key) ?? null;
}
export function arElectionById(id: string): ArPresElection | null {
  return getArElections().elections.find((e) => e.id === id) ?? null;
}
export function arNeighbours(id: string): { prev: ArPresElection | null; next: ArPresElection | null } {
  const els = getArElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const arFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-AR"));
export const arFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// The winner to display: the candidate matching presAfter where one exists —
// 2003's runoff was cancelled by withdrawal, so the round-one leader (Menem)
// was not the president elected (Kirchner).
export function arWinnerOf(e: ArPresElection): ArPresCandidate | null {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  if (e.presAfter) {
    const hit = e.candidates.find(
      (c) => c.name.toLowerCase().includes(e.presAfter!.name.toLowerCase()) ||
             e.presAfter!.name.toLowerCase().includes(c.name.toLowerCase()),
    );
    if (hit) return hit;
  }
  return byBest[0] ?? null;
}

// Records & superlatives from the free contests: the Sáenz Peña era
// (1916–1928), 1946, the unbanned 1973 votes and the democracy since 1983.
export type ArElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeArRecords(): ArElectionRecord[] {
  const els = getArElections().elections;
  const free = els.filter((e) => !e.caveat);
  const recs: ArElectionRecord[] = [];
  const withTurnout = free.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: arFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — voting has been compulsory since 1912` });
  }
  const winners = free
    .map((e) => ({ e, w: arWinnerOf(e) }))
    .filter((x): x is { e: ArPresElection; w: ArPresCandidate } => x.w != null);
  if (winners.length) {
    const top = winners.reduce((a, b) =>
      ((a.w.r2Share ?? a.w.r1Share ?? 0) >= (b.w.r2Share ?? b.w.r1Share ?? 0) ? a : b));
    recs.push({
      label: "Highest winning share", value: arFmtPct(top.w.r2Share ?? top.w.r1Share),
      electionId: top.e.id, detail: `${top.w.name}, ${top.e.label}`,
    });
    const modern = winners.filter((x) => x.e.year >= 1983);
    const low = modern.reduce((a, b) => ((a.w.r1Share ?? 100) <= (b.w.r1Share ?? 100) ? a : b));
    recs.push({
      label: "Lowest share to reach the presidency", value: arFmtPct(low.w.r1Share),
      electionId: low.e.id, detail: `${low.w.name}, ${low.e.label}`,
    });
  }
  recs.push({ label: "First secret-ballot election", value: "1916", electionId: "1916", detail: "the Sáenz Peña Law made the vote secret, universal for men and compulsory" });
  recs.push({ label: "Women vote for the first time", value: "1951", electionId: "1951", detail: "3.8 million women enrolled; most voted for Perón" });
  recs.push({ label: "Elections since democracy returned", value: String(els.filter((e) => e.year >= 1983).length), electionId: "1983", detail: "unbroken presidential elections since 1983 — an Argentine record" });
  return recs;
}
