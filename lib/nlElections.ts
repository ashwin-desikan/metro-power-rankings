import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type NlElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type NlElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: NlElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type NlElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: NlElection[];
};

// ---------------- loader ----------------
let _core: NlElectionsFile | null = null;
export function getNlElections(): NlElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "nl-elections.json"), "utf-8"),
  ) as NlElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Dutch party colors; names always accompany the color.
const P: Record<string, string> = {
  VVD: "#FF7404", "People's Party for Freedom and Democracy": "#FF7404",
  PvdA: "#DF111A", "Labour Party": "#DF111A", SDAP: "#DF111A", "Social Democratic Workers' Party": "#DF111A",
  "GL/PvdA": "#CC0033", "GroenLinks–PvdA": "#CC0033", GL: "#83BC26", GroenLinks: "#83BC26", "Green Left": "#83BC26",
  CDA: "#007B5F", "Christian Democratic Appeal": "#007B5F",
  D66: "#01AF40", "Democrats 66": "#01AF40",
  PVV: "#012758", "Party for Freedom": "#012758",
  SP: "#E3001A", "Socialist Party": "#E3001A",
  KVP: "#F0C51F", "Catholic People's Party": "#F0C51F", Catholic: "#F0C51F", "General League": "#F0C51F",
  AB: "#F0C51F", RKSP: "#F0C51F", "Roman Catholic State Party": "#F0C51F",
  ARP: "#2F7A4B", "Anti-Revolutionary Party": "#2F7A4B",
  CHU: "#6BA3D6", "Christian Historical Union": "#6BA3D6",
  LU: "#4E8EC4", "Liberal Union": "#4E8EC4", "Free Liberals": "#37517E", "Free-thinking Democratic League": "#6FA8DC",
  VDB: "#6FA8DC", "Liberal State Party": "#37517E", LSP: "#37517E",
  CPN: "#C1121F", "Communist Party of the Netherlands": "#C1121F", CPH: "#C1121F",
  PPR: "#5BAA5B", PSP: "#B01C2E", "DS'70": "#8E7CC3", "DS70": "#8E7CC3",
  CU: "#00A7EB", ChristenUnie: "#00A7EB", "Christian Union": "#00A7EB",
  SGP: "#F08000", "Reformed Political Party": "#F08000", GPV: "#5A7D9A", RPF: "#3E5C76",
  LPF: "#23285A", "Pim Fortuyn List": "#23285A", "Fortuyn List": "#23285A",
  FvD: "#841818", "Forum for Democracy": "#841818",
  NSC: "#24365C", "New Social Contract": "#24365C",
  BBB: "#95C11F", "Farmer–Citizen Movement": "#95C11F",
  PvdD: "#006C2E", "Party for the Animals": "#006C2E", DENK: "#00B7B2", Volt: "#502379",
  JA21: "#233E7A", "50PLUS": "#93117E", D70: "#8E7CC3",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function nlPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Catholic/i.test(name)) return "#F0C51F";
  if (/Labour|Social Democratic|Socialist/i.test(name)) return "#DF111A";
  if (/Communist/i.test(name)) return "#C1121F";
  if (/Anti-Revolutionary/i.test(name)) return "#2F7A4B";
  if (/Christian Historical/i.test(name)) return "#6BA3D6";
  if (/Christian|Reformed/i.test(name)) return "#00A7EB";
  if (/Freedom and Democracy/i.test(name)) return "#FF7404";
  if (/Freedom/i.test(name)) return "#012758";
  if (/Liberal/i.test(name)) return "#4E8EC4";
  if (/Green/i.test(name)) return "#83BC26";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function nlEraOf(key: string) {
  return getNlElections().eras.find((e) => e.key === key) ?? null;
}
export function nlElectionById(id: string): NlElection | null {
  return getNlElections().elections.find((e) => e.id === id) ?? null;
}
export function nlNeighbours(id: string): { prev: NlElection | null; next: NlElection | null } {
  const els = getNlElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const nlFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("nl-NL"));
export const nlFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives. Every Dutch election was free; PR-era records begin
// with the 1918 proportional system.
export type NlElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeNlRecords(): NlElectionRecord[] {
  const els = getNlElections().elections;
  const pr = els.filter((e) => e.year >= 1918);
  const recs: NlElectionRecord[] = [];
  const withTurnout = pr.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: nlFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} — compulsory voting lasted until 1970` });
    recs.push({ label: "Lowest turnout", value: nlFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withSeats = pr
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: nlFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label} — of 150 seats` });
  }
  const withShare = pr
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: nlFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label} — no Dutch party has ever won a majority alone` });
  }
  const seatCounts = pr.map((e) => ({ e, n: e.parties.filter((p) => (p.seats ?? 0) > 0).length }));
  if (seatCounts.length) {
    const frag = seatCounts.reduce((a, b) => (a.n >= b.n ? a : b));
    recs.push({ label: "Most parties listed with seats", value: String(frag.n), electionId: frag.e.id, detail: `${frag.e.label} — among Europe's most fragmented parliaments` });
  }
  recs.push({ label: "The Pacification", value: "1917", electionId: "1917", detail: "one election settled the school struggle, adopted PR and opened universal suffrage" });
  return recs;
}
