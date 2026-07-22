import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type InElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null;
  alliance: string | null; // NDA / UPA / INDIA etc., where the source reports it
};
export type InElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null; // elected seats contested
  majoritySeats: number | null;
  turnout: number | null; // percent
  parties: InElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
};
export type InElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: InElection[];
};

// ---------------- loader ----------------
let _core: InElectionsFile | null = null;
export function getInElections(): InElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "in-elections.json"), "utf-8"),
  ) as InElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Indian party colors; names always accompany the color.
const P: Record<string, string> = {
  BJP: "#F97316", "Bharatiya Janata Party": "#F97316", BJS: "#FF8C42", "Bharatiya Jana Sangh": "#FF8C42",
  INC: "#1D9BF0", "Indian National Congress": "#1D9BF0", Congress: "#1D9BF0",
  "Indian National Congress (R)": "#1D9BF0", "Indian National Congress (I)": "#1D9BF0",
  "Congress (R)": "#1D9BF0", "Congress (I)": "#1D9BF0", "INC(R)": "#1D9BF0", "INC(I)": "#1D9BF0",
  "Indian National Congress (O)": "#5FA8D3", "Congress (O)": "#5FA8D3", "NCO": "#5FA8D3",
  CPI: "#D62828", "Communist Party of India": "#D62828",
  "CPI(M)": "#9D0208", "Communist Party of India (Marxist)": "#9D0208",
  "Janata Party": "#6A994E", JP: "#6A994E", "Janata Dal": "#38A3A5", JD: "#38A3A5",
  "Janata Party (Secular)": "#87986A", "Janata Dal (United)": "#38A3A5", "JD(U)": "#38A3A5",
  BLD: "#6A994E", "Bharatiya Lok Dal": "#6A994E", "Lok Dal": "#87986A",
  BSP: "#22409A", "Bahujan Samaj Party": "#22409A",
  SP: "#B23A48", "Samajwadi Party": "#B23A48", "Swaraj Party": "#B08968",
  TDP: "#FCBF49", "Telugu Desam Party": "#FCBF49",
  DMK: "#C1121F", AIADMK: "#386641", "ADMK": "#386641",
  AITC: "#52B788", TMC: "#52B788", "All India Trinamool Congress": "#52B788", "Trinamool Congress": "#52B788",
  BJD: "#52796F", "Biju Janata Dal": "#52796F",
  "Shiv Sena": "#FF7D00", NCP: "#0E9594", "Nationalist Congress Party": "#0E9594",
  AAP: "#0096C7", "Aam Aadmi Party": "#0096C7",
  YSRCP: "#2D6A4F", "YSR Congress Party": "#2D6A4F",
  AIML: "#1B4332", "All-India Muslim League": "#1B4332", "Muslim League": "#1B4332",
  PSP: "#C77DFF", "Praja Socialist Party": "#C77DFF", SSP: "#9D4EDD", "Socialist Party": "#C77DFF", Socialist: "#C77DFF",
  NP: "#8D6E63", "Nationalist Party": "#8D6E63", ILP: "#5E60CE", "Independent Labour Party": "#5E60CE",
  "Central Muhammadan Party": "#40916C", Democrats: "#748CAB",
  NDA: "#F97316", UPA: "#1D9BF0", INDIA: "#2364AA",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function inPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Congress/i.test(name)) return "#1D9BF0";
  if (/Bharatiya Janata|Jana Sangh/i.test(name)) return "#F97316";
  if (/Communist/i.test(name)) return "#D62828";
  if (/Janata|Lok Dal/i.test(name)) return "#6A994E";
  if (/Socialist/i.test(name)) return "#C77DFF";
  if (/Muslim League/i.test(name)) return "#1B4332";
  return "#9ca3af";
}

// Congress family and BJP family, for the dominance chart.
export function inIsCongressFamily(name: string | null): boolean {
  if (!name) return false;
  return /Congress/i.test(name) && !/Trinamool|YSR|Nationalist Congress/i.test(name);
}
export function inIsBjpFamily(name: string | null): boolean {
  if (!name) return false;
  return /^(BJP|Bharatiya Janata|BJS|Bharatiya Jana Sangh)/i.test(name);
}

// ---------------- helpers ----------------
export function inEraOf(key: string) {
  return getInElections().eras.find((e) => e.key === key) ?? null;
}
export function inElectionById(id: string): InElection | null {
  return getInElections().elections.find((e) => e.id === id) ?? null;
}
export function inNeighbours(id: string): { prev: InElection | null; next: InElection | null } {
  const els = getInElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const inFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-IN"));
export const inFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset (post-independence).
export type InElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeInRecords(): InElectionRecord[] {
  const els = getInElections().elections.filter((e) => e.year >= 1951);
  const recs: InElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: inFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest turnout", value: inFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withSeats = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: inFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  const withVotes = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.votes != null);
  if (withVotes.length) {
    const most = withVotes.reduce((a, b) => ((a.p.votes ?? 0) >= (b.p.votes ?? 0) ? a : b));
    recs.push({ label: "Most votes for one party", value: inFmtInt(most.p.votes), electionId: most.e.id, detail: `${most.p.name}, ${most.e.label}` });
  }
  const changes = els.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of Prime Minister at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : els[els.length - 1].id,
    detail: `of ${els.length} general elections since 1951`,
  });
  const withShare = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: inFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  return recs;
}
