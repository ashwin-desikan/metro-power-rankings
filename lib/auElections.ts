import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type AuElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null; // percent, House primary vote
  swing: number | null; // percentage points
};
export type AuElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null; // percent
  parties: AuElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
};
export type AuElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: AuElection[];
};

// ---------------- loader ----------------
let _core: AuElectionsFile | null = null;
export function getAuElections(): AuElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "au-elections.json"), "utf-8"),
  ) as AuElectionsFile);
}

// ---------------- party colors ----------------
// Conventional Australian party colors; the Coalition and its ancestors share
// the blue family. Names always accompany the color.
const P: Record<string, string> = {
  Labor: "#E13940", Labour: "#E13940",
  Liberal: "#1C4F9C", "Liberal–National Coalition": "#1C4F9C",
  "Liberal–Country Coalition": "#1C4F9C", "Liberal–National Country Coalition": "#1C4F9C",
  "Liberal Movement": "#4A7BC8",
  National: "#00693E", Country: "#00693E", "National Country": "#00693E",
  Nationalist: "#26547C", "United Australia": "#2E5C9E", "United Australia–Country Coalition": "#2E5C9E",
  "Nationalist–Country Coalition": "#26547C",
  Protectionist: "#D97706", "Free Trade": "#7C3AED", "Anti-Socialist": "#7C3AED",
  "Tariff Reform": "#8B5CF6", "Revenue Tariff": "#A78BFA",
  Greens: "#10C25B", "The Greens": "#10C25B",
  Democrats: "#F9A825", "Australian Democrats": "#F9A825",
  "Democratic Labor": "#00539F", "Democratic Labour": "#00539F",
  "One Nation": "#F36C21", "Pauline Hanson's One Nation": "#F36C21",
  "Katter's Australian": "#B0413E", "Centre Alliance": "#FF7F00",
  "Nick Xenophon Team": "#FF7F00", "United Australia Party": "#2E5C9E",
  "Lang Labor": "#A62639", "Non-Communist Labor": "#A62639", "State Labor": "#A62639",
  "Emergency Committee": "#5B7DB1",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af", Other: "#9ca3af",
};
export function auPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Labor|Labour/i.test(name)) return "#E13940";
  if (/^Liberal/.test(name)) return "#1C4F9C";
  if (/United Australia/.test(name)) return "#2E5C9E";
  if (/Country|National/.test(name)) return "#00693E";
  if (/Green/.test(name)) return "#10C25B";
  return "#9ca3af";
}

// Labor and the Coalition family, for the two-party charts.
export const AU_LABOR = new Set(["Labor", "Labour"]);
export function auIsCoalitionFamily(name: string | null): boolean {
  if (!name) return false;
  return /^(Liberal|Nationalist|United Australia|Protectionist|Free Trade|Anti-Socialist)/.test(name) ||
    /Coalition/.test(name);
}

// ---------------- helpers ----------------
export function auEraOf(key: string) {
  return getAuElections().eras.find((e) => e.key === key) ?? null;
}
export function auElectionById(id: string): AuElection | null {
  return getAuElections().elections.find((e) => e.id === id) ?? null;
}
export function auNeighbours(id: string): { prev: AuElection | null; next: AuElection | null } {
  const els = getAuElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const auFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-AU"));
export const auFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset (no hand-entered figures).
export type AuElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeAuRecords(): AuElectionRecord[] {
  const els = getAuElections().elections;
  const recs: AuElectionRecord[] = [];
  // compulsory voting arrived in 1924, so turnout records split there
  const compulsory = els.filter((e) => e.turnout != null && e.year >= 1925);
  if (compulsory.length) {
    const hi = compulsory.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = compulsory.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout (compulsory era)", value: auFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} federal election` });
    recs.push({ label: "Lowest turnout since 1925", value: auFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} federal election` });
  }
  const withSeats = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null && x.e.totalSeats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: auFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
    const shareOf = (x: { e: AuElection; p: AuElectionParty }) => (x.p.seats ?? 0) / (x.e.totalSeats ?? 1);
    const sweep = withSeats.reduce((a, b) => (shareOf(a) >= shareOf(b) ? a : b));
    recs.push({
      label: "Biggest share of the House", value: `${(shareOf(sweep) * 100).toFixed(1)}%`, electionId: sweep.e.id,
      detail: `${sweep.p.name}, ${sweep.e.label}: ${sweep.p.seats} of ${sweep.e.totalSeats} seats`,
    });
  }
  const withShare = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest primary vote", value: auFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSwing = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.swing != null);
  if (withSwing.length) {
    const swing = withSwing.reduce((a, b) => (Math.abs(a.p.swing ?? 0) >= Math.abs(b.p.swing ?? 0) ? a : b));
    recs.push({
      label: "Biggest primary swing", value: `${(swing.p.swing ?? 0) > 0 ? "+" : ""}${(swing.p.swing ?? 0).toFixed(1)} pts`,
      electionId: swing.e.id, detail: `${swing.p.name}, ${swing.e.label}`,
    });
  }
  const changes = els.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of Prime Minister at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : els[els.length - 1].id,
    detail: `of ${els.length} elections — most recently ${changes.length ? changes[changes.length - 1].label : "—"}`,
  });
  return recs;
}
