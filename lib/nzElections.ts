import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type NzElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
export type NzElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: NzElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
};
export type NzElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: NzElection[];
};

// ---------------- loader ----------------
let _core: NzElectionsFile | null = null;
export function getNzElections(): NzElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "nz-elections.json"), "utf-8"),
  ) as NzElectionsFile);
}

// ---------------- party colors ----------------
// Conventional New Zealand party colors; names always accompany the color.
const P: Record<string, string> = {
  Labour: "#D82A20", "Labour Party": "#D82A20", "New Zealand Labour Party": "#D82A20",
  National: "#00529F", "National Party": "#00529F", "New Zealand National Party": "#00529F",
  Liberal: "#E3B505", "Liberal Party": "#E3B505", "Liberal–Labour": "#C99700",
  Reform: "#1F4E79", "Reform Party": "#1F4E79", "United/Reform": "#3E5C76", "United–Reform": "#3E5C76",
  United: "#6495ED", "United Party": "#6495ED", "United Future": "#501557",
  "New Zealand First": "#2F2F2F", "NZ First": "#2F2F2F",
  Green: "#098137", Greens: "#098137", "Green Party": "#098137",
  ACT: "#FDE401", "ACT New Zealand": "#FDE401",
  Alliance: "#ED1A3B", "Te Pāti Māori": "#B2001A", "Māori Party": "#B2001A", Ratana: "#7B2D8B",
  "Social Credit": "#7FBE41", "Democratic Party": "#7FBE41", Democrats: "#7FBE41",
  Progressive: "#9E1B32", "Progressive Party": "#9E1B32", "Jim Anderton's Progressive": "#9E1B32",
  Conservative: "#00AEEF", "Country Party": "#8B5E3C", "Values Party": "#5BAA5B",
  "New Labour": "#C1121F", Mana: "#8B0000", "Independent Political Labour League": "#C1440E",
  Independent: "#6b7280", Independents: "#6b7280", Others: "#9ca3af",
};
export function nzPartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name] ?? P[name.replace(/\s+Party$/i, "").trim()];
  if (hit) return hit;
  if (/Labour/i.test(name)) return "#D82A20";
  if (/National/i.test(name)) return "#00529F";
  if (/Liberal/i.test(name)) return "#E3B505";
  if (/Reform/i.test(name)) return "#1F4E79";
  if (/Green/i.test(name)) return "#098137";
  if (/First/i.test(name)) return "#2F2F2F";
  if (/Social Credit|Democrat/i.test(name)) return "#7FBE41";
  if (/Māori|Maori/i.test(name)) return "#B2001A";
  return "#9ca3af";
}

// ---------------- helpers ----------------
export function nzEraOf(key: string) {
  return getNzElections().eras.find((e) => e.key === key) ?? null;
}
export function nzElectionById(id: string): NzElection | null {
  return getNzElections().elections.find((e) => e.id === id) ?? null;
}
export function nzNeighbours(id: string): { prev: NzElection | null; next: NzElection | null } {
  const els = getNzElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const nzFmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-NZ"));
export const nzFmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives. Every NZ election was free; the party era starts in
// 1890, so party-based records begin there.
export type NzElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeNzRecords(): NzElectionRecord[] {
  const els = getNzElections().elections;
  const party = els.filter((e) => e.year >= 1890);
  const recs: NzElectionRecord[] = [];
  const withTurnout = party.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: nzFmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
    recs.push({ label: "Lowest turnout", value: nzFmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  }
  const withShare = party
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.share != null);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: nzFmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = party
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: nzFmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
  recs.push({ label: "First with women's suffrage", value: "1893", electionId: "1893", detail: "the first national election in the world in a self-governing country where women voted" });
  const changes = party.filter((e) => e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  recs.push({
    label: "Changes of PM at the ballot box", value: String(changes.length),
    electionId: changes.length ? changes[changes.length - 1].id : party[party.length - 1].id,
    detail: `of ${party.length} elections since the party era began in 1890`,
  });
  return recs;
}
