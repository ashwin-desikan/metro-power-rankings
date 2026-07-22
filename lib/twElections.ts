import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type TwPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type TwPresElection = {
  id: string; // year
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: TwPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type TwElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: TwPresElection[];
};

// ---------------- loader ----------------
let _core: TwElectionsFile | null = null;
export function getTwElections(): TwElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "tw-elections.json"), "utf-8"),
  ) as TwElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Taiwanese (ROC) party colors; names always accompany the color.
const P: Record<string, string> = {
  KMT: "#000095", Kuomintang: "#000095", "Chinese Nationalist Party": "#000095",
  DPP: "#1B9431", "Democratic Progressive Party": "#1B9431",
  TPP: "#28C8C8", "Taiwan People's Party": "#28C8C8",
  PFP: "#FF6310", "People First Party": "#FF6310",
  "New Party": "#FFDB00", NP: "#FFDB00",
  Tongmenghui: "#B22222", "Progressive Party": "#4E8EC4", "Republican Party": "#37517E",
  "Zhili clique": "#8B5E3C", "Anhui clique": "#5A7D9A", "Fengtian clique": "#6B4226",
  "Communist Party": "#C1121F", Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function twPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Kuomintang|Nationalist/i.test(name)) return "#000095";
  if (/Democratic Progressive/i.test(name)) return "#1B9431";
  if (/People First/i.test(name)) return "#FF6310";
  if (/People's/i.test(name)) return "#28C8C8";
  if (/clique/i.test(name)) return "#8B5E3C";
  if (/Communist/i.test(name)) return "#C1121F";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function twEraOf(key: string) {
  return getTwElections().eras.find((e) => e.key === key) ?? null;
}
export function twElectionById(id: string): TwPresElection | null {
  return getTwElections().elections.find((e) => e.id === id) ?? null;
}
export function twNeighbours(id: string): { prev: TwPresElection | null; next: TwPresElection | null } {
  const els = getTwElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const twFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const twFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives from the direct-election era (1996 onward); the
// indirect National Assembly rituals and Beiyang votes are excluded.
export type TwElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeTwRecords(): TwElectionRecord[] {
  const direct = getTwElections().elections.filter((e) => e.year >= 1996);
  const recs: TwElectionRecord[] = [];
  const withTurnout = direct.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: twFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} presidential election` });
    recs.push({ label: "Lowest turnout", value: twFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} presidential election` });
  }
  const winners = direct
    .map((e) => {
      const w = e.candidates
        .filter((c) => c.r1Share != null)
        .sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
      return w ? { e, w } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (winners.length) {
    const top = winners.reduce((a, b) => ((a.w.r1Share ?? 0) >= (b.w.r1Share ?? 0) ? a : b));
    const low = winners.reduce((a, b) => ((a.w.r1Share ?? 100) <= (b.w.r1Share ?? 100) ? a : b));
    recs.push({ label: "Biggest winning share", value: twFmtPct(top.w.r1Share), electionId: top.e.id, detail: `${top.w.name}, ${top.e.label}` });
    recs.push({ label: "Lowest winning share", value: twFmtPct(low.w.r1Share), electionId: low.e.id, detail: `${low.w.name}, ${low.e.label} — a three-way race` });
  }
  recs.push({ label: "Margin of the 2004 election", value: "0.22%", electionId: "2004", detail: "about 29,500 votes, the day after an assassination attempt" });
  recs.push({ label: "First direct election", value: "1996", electionId: "1996", detail: "held while the PLA fired missiles into the Taiwan Strait" });
  return recs;
}
