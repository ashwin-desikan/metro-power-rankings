import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type KeElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type KeLegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: KeElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type KePresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type KePresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: KePresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
export type KeElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: KePresElection[];
  legislative: KeLegElection[];
};

// ---------------- loader ----------------
let _core: KeElectionsFile | null = null;
export function getKeElections(): KeElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "ke-elections.json"), "utf-8"),
  ) as KeElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Kenyan party colours; the name always accompanies the colour.
const P: Record<string, string> = {
  "Kenya African National Union": "#BE0000",
  "KANU": "#BE0000",
  "Democratic Party": "#1F4E96",
  "Democratic Party of Kenya": "#1F4E96",
  "FORD–Kenya": "#0B6E4F",
  "FORD-Kenya": "#0B6E4F",
  "FORD-K": "#0B6E4F",
  "FORD–People": "#6A1B9A",
  "FORD-People": "#6A1B9A",
  "FORD–Asili": "#14807A",
  "FORD-Asili": "#14807A",
  "National Rainbow Coalition": "#F5821F",
  "NARC": "#F5821F",
  "National Rainbow Coalition – Kenya": "#C77A2E",
  "NARC–Kenya": "#C77A2E",
  "Orange Democratic Movement": "#F7941D",
  "ODM": "#F7941D",
  "Orange Democratic Movement–Kenya": "#B36A17",
  "ODM–Kenya": "#B36A17",
  "Party of National Unity": "#003087",
  "PNU": "#003087",
  "The National Alliance": "#8B0000",
  "TNA": "#8B0000",
  "United Republican Party": "#29ABE2",
  "URP": "#29ABE2",
  "Jubilee Party": "#E4032E",
  "Jubilee Alliance": "#E4032E",
  "Wiper Democratic Movement – Kenya": "#046A38",
  "Wiper": "#046A38",
  "United Democratic Alliance": "#FFD100",
  "UDA": "#FFD100",
  "Azimio la Umoja": "#F7941D",
  "Azimio": "#F7941D",
  "Kenya Kwanza": "#FFD100",
  "Amani National Congress": "#00A0DC",
  "Amani": "#00A0DC",
  "Safina": "#4C9A2A",
  "Shirikisho Party of Kenya": "#7B3F00",
  "KADU–Asili": "#4A5D9E",
  "KADU-Asili": "#4A5D9E",
  "Kenya African Democratic Union": "#4A5D9E",
  "Independent": "#9ca3af",
  "Independents": "#9ca3af",
  "Appointed members": "#9ca3af",
};
export function kePartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
  if (/KANU|Kenya African National Union/i.test(name)) return "#BE0000";
  if (/ODM|Orange Democratic Movement/i.test(name)) return "#F7941D";
  if (/Jubilee/i.test(name)) return "#E4032E";
  if (/FORD/i.test(name)) return "#0B6E4F";
  if (/Democratic Party/i.test(name)) return "#1F4E96";
  if (/Wiper/i.test(name)) return "#046A38";
  if (/UDA|United Democratic Alliance|Kenya Kwanza/i.test(name)) return "#FFD100";
  if (/NARC|Rainbow/i.test(name)) return "#F5821F";
  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function keLegEraOf(key: string) {
  return getKeElections().legEras.find((e) => e.key === key) ?? null;
}
export function kePresEraOf(key: string) {
  return getKeElections().presEras.find((e) => e.key === key) ?? null;
}
export function keElectionById(id: string): KeLegElection | KePresElection | null {
  const f = getKeElections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function keLegNeighbours(id: string): { prev: KeLegElection | null; next: KeLegElection | null } {
  const els = getKeElections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function kePresNeighbours(id: string): { prev: KePresElection | null; next: KePresElection | null } {
  const els = getKeElections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const keFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const keFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type KeElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeKeRecords(): KeElectionRecord[] {
  const recs: KeElectionRecord[] = [];
  const pres = getKeElections().presidential.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: keFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: keFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: KePresElection; w: KePresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: keFmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: keFmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
  const els = getKeElections().legislative.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: keFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: keFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: keFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: keFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "Largest National Assembly majority", value: "158 of 158 elected", electionId: "1974", detail: "Every elected seat was contested by KANU alone; no other party was on the ballot." });
  recs.push({ label: "Lowest presidential turnout", value: "39.03%", electionId: "pres-2017-october", detail: "Raila Odinga withdrew and urged a boycott after the annulled August vote." });
  recs.push({ label: "Closest presidential result", value: "1.6 points", electionId: "pres-2022", detail: "William Ruto's 50.49% against Raila Odinga's 48.85%." });
  return recs;
}
