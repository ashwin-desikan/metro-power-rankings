import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type PhPresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type PhPresElection = {
  id: string; // year, plus "1973-mar" / "1973-sep"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: PhPresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
};
export type PhElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: PhPresElection[];
};

// ---------------- loader ----------------
let _core: PhElectionsFile | null = null;
export function getPhElections(): PhElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ph-elections.json"), "utf-8"),
  ) as PhElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Philippine party colors; names always accompany the color.
const P: Record<string, string> = {
  "Nacionalista": "#C41E3A",
  "Nacionalista Party": "#C41E3A",
  "Liberal": "#F0C000",
  "Liberal Party": "#F0C000",
  "PDP–Laban": "#D2691E",
  "PDP-Laban": "#D2691E",
  "Lakas": "#1F5C9E",
  "Lakas–CMD": "#1F5C9E",
  "Partido Federal ng Pilipinas": "#0038A8",
  "KBL": "#8B0000",
  "Kilusang Bagong Lipunan": "#8B0000",
  "UNIDO": "#F4A300",
  "LDP": "#0F4C81",
  "Independent": "#9ca3af",
  "Others": "#9ca3af",
};
export function phPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  // Unmapped parties take the neutral grey rather than a colour that
  // would imply a party family they do not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function phEraOf(key: string) {
  return getPhElections().eras.find((e) => e.key === key) ?? null;
}
export function phElectionById(id: string): PhPresElection | null {
  return getPhElections().elections.find((e) => e.id === id) ?? null;
}
export function phNeighbours(id: string): { prev: PhPresElection | null; next: PhPresElection | null } {
  const els = getPhElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const phFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const phFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// The winner to display: the candidate the office actually went to. Where a
// second round was held its shares decide; where the record names the person
// who took office, that name wins over the raw arithmetic, because a runoff
// that was cancelled or a count that was overturned is exactly the case a
// "highest share" rule gets wrong.
export function phWinnerOf(e: PhPresElection): PhPresCandidate | null {
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

// Records and superlatives. Contests with no result on file, and the rows
// this atlas labels unfree, are excluded where including them would flatter
// the number rather than explain it.
export type PhElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computePhRecords(): PhElectionRecord[] {
  const els = getPhElections().elections;
  const free = els.filter((e) => !e.caveat);
  const recs: PhElectionRecord[] = [];
  const withTurnout = free.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    recs.push({ label: "Highest turnout", value: phFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — voting has been compulsory since 1912` });
  }
  const winners = free
    .map((e) => ({ e, w: phWinnerOf(e) }))
    .filter((x): x is { e: PhPresElection; w: PhPresCandidate } => x.w != null);
  if (winners.length) {
    const top = winners.reduce((a, b) =>
      ((a.w.r2Share ?? a.w.r1Share ?? 0) >= (b.w.r2Share ?? b.w.r1Share ?? 0) ? a : b));
    recs.push({
      label: "Highest winning share", value: phFmtPct(top.w.r2Share ?? top.w.r1Share),
      electionId: top.e.id, detail: `${top.w.name}, ${top.e.label}`,
    });
    const modern = winners.filter((x) => x.e.year >= 1983);
    const low = modern.reduce((a, b) => ((a.w.r1Share ?? 100) <= (b.w.r1Share ?? 100) ? a : b));
    recs.push({
      label: "Lowest share to reach the presidency", value: phFmtPct(low.w.r1Share),
      electionId: low.e.id, detail: `${low.w.name}, ${low.e.label}`,
    });
  }
  recs.push({ label: "Women vote for the first time", value: "1951", electionId: "1951", detail: "3.8 million women enrolled; most voted for Perón" });
  return recs;
}
