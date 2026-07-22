import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type JpElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null;
};
export type JpElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null; // percent
  parties: JpElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null; // the managed wartime vote of 1942
};
export type JpElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: JpElection[];
};

// ---------------- loader ----------------
let _core: JpElectionsFile | null = null;
export function getJpElections(): JpElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "jp-elections.json"), "utf-8"),
  ) as JpElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Japanese party colors; names always accompany the color.
const P: Record<string, string> = {
  LDP: "#3CA324", "Liberal Democratic Party": "#3CA324", "Liberal Democratic": "#3CA324",
  CDP: "#00469C", "Constitutional Democratic Party": "#00469C", "Constitutional Democratic": "#00469C",
  "Rikken Minseitō": "#2364AA", Minseitō: "#2364AA", Kenseikai: "#2E86AB", "Kenseitō": "#2E86AB",
  "Rikken Seiyūkai": "#B03A2E", Seiyūkai: "#B03A2E",
  JSP: "#F06292", "Japan Socialist Party": "#F06292", "Socialist Party": "#F06292",
  "Social Democratic Party": "#F06292", SDP: "#F06292",
  "Left Socialist": "#E4407E", "Right Socialist": "#F48FB1",
  DPJ: "#E4002B", "Democratic Party of Japan": "#E4002B", Democratic: "#E4002B",
  "Democratic Party": "#E4002B", Minshutō: "#E4002B",
  Komeito: "#F55AA3", Kōmeitō: "#F55AA3",
  JCP: "#DB001C", "Japanese Communist Party": "#DB001C", Communist: "#DB001C",
  Ishin: "#6FBA2C", "Japan Innovation Party": "#6FBA2C", "Japan Restoration Party": "#6FBA2C", Restoration: "#6FBA2C",
  DPP: "#FFD400", "Democratic Party for the People": "#FFD400",
  "Kibō no Tō": "#106F3E", Kibō: "#106F3E", "Party of Hope": "#106F3E",
  "New Frontier Party": "#0F52BA", NFP: "#0F52BA", Shinshintō: "#0F52BA",
  "Japan Renewal Party": "#38A3A5", "Japan New Party": "#2A9D8F", "New Party Sakigake": "#588157",
  "Your Party": "#FFD700", "Your": "#FFD700",
  "Democratic Socialist Party": "#C77DFF", DSP: "#C77DFF",
  Reiwa: "#E75590", "Reiwa Shinsengumi": "#E75590", Sanseitō: "#F97316", Sansei: "#F97316",
  "Taisei Yokusankai": "#6B4423", "Imperial Rule Assistance": "#6B4423", "Not endorsed": "#8a8f98",
  Liberal: "#B03A2E", Jiyūtō: "#B03A2E", "Rikken Kaishintō": "#2E86AB", "Rikken Kakushintō": "#4E8EC4",
  Shimpotō: "#2E86AB", "Kokumin Kyōkai": "#8D6E63", Taiseikai: "#8D6E63", "Chūō Club": "#748CAB",
  "Rikken Kokumintō": "#4E8EC4", Kokumintō: "#4E8EC4", "Rikken Dōshikai": "#2E86AB",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af", "Centrist Reform": "#0E9594",
};
export function jpPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Seiyūkai/i.test(name)) return "#B03A2E";
  if (/Minseitō|Kenseikai|Kaishin|Dōshikai|Shimpo/i.test(name)) return "#2E86AB";
  if (/Socialist/i.test(name)) return "#F06292";
  if (/Communist/i.test(name)) return "#DB001C";
  if (/Democratic/i.test(name)) return "#E4002B";
  if (/Liberal/i.test(name)) return "#B03A2E";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function jpEraOf(key: string) {
  return getJpElections().eras.find((e) => e.key === key) ?? null;
}
export function jpElectionById(id: string): JpElection | null {
  return getJpElections().elections.find((e) => e.id === id) ?? null;
}
export function jpNeighbours(id: string): { prev: JpElection | null; next: JpElection | null } {
  const els = getJpElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const jpFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ja-JP"));
export const jpFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives; the managed 1942 vote is excluded.
export type JpElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeJpRecords(): JpElectionRecord[] {
  const els = getJpElections().elections.filter((e) => !e.caveat);
  const recs: JpElectionRecord[] = [];
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: jpFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest turnout", value: jpFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withSeats = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: jpFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  const ldpWins = els.filter((e) => e.year >= 1955 && /Liberal Democratic|LDP/.test(e.seatLeader ?? "")).length;
  recs.push({
    label: "Elections with the LDP largest party", value: String(ldpWins), electionId: "1955",
    detail: `of ${els.filter((e) => e.year >= 1955).length} since the party's founding in 1955`,
  });
  const changes = els.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of PM at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : els[els.length - 1].id,
    detail: "governments in Japan more often change between elections than at them",
  });
  const withSwing = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seatChange != null);
  if (withSwing.length) {
    const big = withSwing.reduce((a, b) => (Math.abs(a.p.seatChange ?? 0) >= Math.abs(b.p.seatChange ?? 0) ? a : b));
    recs.push({
      label: "Biggest seat swing", value: `${(big.p.seatChange ?? 0) > 0 ? "+" : ""}${Math.round(big.p.seatChange ?? 0)}`,
      electionId: big.e.id, detail: `${big.p.name}, ${big.e.label}`,
    });
  }
  return recs;
}
