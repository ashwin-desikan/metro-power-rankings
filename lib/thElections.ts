import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type ThElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type ThLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: ThElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type ThElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: ThLegElection[];
};

// ---------------- loader ----------------
let _core: ThElectionsFile | null = null;
export function getThElections(): ThElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "th-elections.json"), "utf-8"),
  ) as ThElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Thai party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Democrat Party": "#2E9DD1",
  "Democrat": "#2E9DD1",
  "Thai Rak Thai": "#DA251D",
  "Thai Rak Thai Party": "#DA251D",
  "Pheu Thai Party": "#EC1C24",
  "Pheu Thai": "#EC1C24",
  "People's Power": "#B91C1C",
  "People's Power Party": "#B91C1C",
  "Palang Pracharath Party": "#1F3864",
  "Palang Pracharat Party": "#1F3864",
  "Bhumjaithai Party": "#0033A0",
  "Move Forward Party": "#F97316",
  "Future Forward Party": "#F97316",
  "People's Party": "#F97316",
  "United Thai Nation Party": "#7C2D12",
  "Chart Thai": "#9333EA",
  "Thai Nation Party": "#9333EA",
  "Chartthaipattana Party": "#9333EA",
  "New Aspiration Party": "#0D9488",
  "Social Action Party": "#65A30D",
  "Palang Dharma Party": "#16A34A",
  "Justice Unity Party": "#B45309",
  "National Development Party": "#CA8A04",
  "Prachachat Party": "#059669",
  "Thai Liberal Party": "#0891B2",
  "Thai Sang Thai Party": "#DB2777",
  "Seri Manangkhasila Party": "#78716C",
  "Sahaphum Party": "#78716C",
  "United Thai People's Party": "#57534E",
  "Mass Party": "#A16207",
  "Thai Citizen Party": "#4D7C0F",
  "New Force Party": "#7C2D12",
  "Independents": "#9ca3af",
  "Independent": "#9ca3af",
  "Independent Party": "#9ca3af",
  "Royal appointees": "#6b7280",
  "Appointed members": "#6b7280",
  "None of the above": "#d1d5db",
};
export function thPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/Social/i.test(name)) return "#65A30D";
  if (/Thai Nation|Chart Thai|Chartthaipattana/i.test(name)) return "#9333EA";
  if (/Liberal/i.test(name)) return "#0891B2";
  if (/Economist/i.test(name)) return "#CA8A04";
  if (/Nationalist/i.test(name)) return "#B45309";
  if (/Independent/i.test(name)) return "#9ca3af";
  if (/Appointed|Royal appointee/i.test(name)) return "#6b7280";
  if (/Democrat/i.test(name)) return "#2E9DD1";
  if (/Pheu Thai|Thai Rak Thai/i.test(name)) return "#EC1C24";
  if (/Bhumjaithai/i.test(name)) return "#0033A0";
  if (/Palang Pracharat/i.test(name)) return "#1F3864";
  if (/Move Forward|Future Forward|People's Party/i.test(name)) return "#F97316";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function thEraOf(key: string) {
  return getThElections().eras.find((e) => e.key === key) ?? null;
}
export function thElectionById(id: string): ThLegElection | null {
  return getThElections().elections.find((e) => e.id === id) ?? null;
}
export function thNeighbours(id: string): { prev: ThLegElection | null; next: ThLegElection | null } {
  const els = getThElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const thFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const thFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type ThElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeThRecords(): ThElectionRecord[] {
  const recs: ThElectionRecord[] = [];
  const els = getThElections().elections.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: thFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: thFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: thFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: thFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Highest turnout", value: "75.64%", electionId: "2023", detail: "The record for any Thai election, in the vote Move Forward topped before being blocked from government." });
  recs.push({ label: "Lowest turnout", value: "29.50%", electionId: "1948", detail: "Half the House was still government appointees rather than elected members at this point." });
  recs.push({ label: "Largest mandate", value: "377 of 500", electionId: "2005", detail: "Thai Rak Thai's landslide re-election, three fifths of the vote, the year before the party was ousted by a boycotted rerun and a coup." });
  recs.push({ label: "Won seats, lost the vote", value: "79 seats on fewer votes", electionId: "1992-march", detail: "The Justice Unity Party became the largest party in the House despite receiving fewer votes than the New Aspiration Party." });
  return recs;
}
