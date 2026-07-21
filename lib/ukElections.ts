import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type UkElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  votes: number | null;
  share: number | null; // percent
  swing: number | null; // percentage points
};
export type UkElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number;
  majoritySeats: number | null;
  turnout: number | null; // percent, UK
  electorate: number | null;
  totalVotes: number | null;
  parties: UkElectionParty[];
  pmBefore: { name: string; party: string } | null;
  pmAfter: { name: string; party: string } | null;
  government: { party: string; pm: string; majority: number | null; note: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
};
export type UkElectionsFile = {
  meta: { title: string; sources: string[]; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: UkElection[];
};

export type TrendPoint = { id: string; [k: string]: number | string | null };
export type VvsGroup = { share: number | null; seatPct: number; seats: number | null };
export type UkElectionTrends = {
  turnout: { id: string; uk: number | null; england: number | null; wales: number | null; scotland: number | null; ni: number | null }[];
  voteVsSeats: ({ id: string } & Partial<Record<"CON" | "LAB" | "LD" | "PC/SNP" | "Other", VvsGroup>>)[];
  twoParty: { id: string; share: number; seatPct: number }[];
  womenMPs: { id: string; total: number | null; pct: number | null }[];
  minorityEthnicMPs: { id: string; total: number | null; pct: number | null }[];
  newMPs: { id: string; total: number | null; pct: number | null }[];
  mpAges: { id: string; median: number | null; conMedian: number | null; labMedian: number | null }[];
  electorate: { id: string; electorate: number }[];
  groups: Record<string, string>;
};

export type DevolvedElection = { year: number; parties: { party: string; seats: number; share: number | null }[]; totalSeats: number };
export type UkElectionsBeyond = {
  devolved: Record<"scotland" | "wales" | "northernIreland", { name: string; elections: DevolvedElection[] }>;
  europarl: { note: string; elections: { year: number; turnout: number | null; parties: { party: string; meps: number; share: number | null }[] }[] };
  local: {
    councillors: { year: string; con: number | null; lab: number | null; ld: number | null; pcsnp: number | null; other: number | null; total: number | null; reform?: number | null }[];
    nevs: { year: string; con: number | null; lab: number | null; ld: number | null; other: number | null }[];
    pcc: { region: string; year: number | null; seats: Record<string, number> }[];
  };
  metroMayors: { note: string; latest: { authority: string; date: string; mayor: string; party: string; sharePct: number | null; turnout: number | null }[] };
  referendums: { year: number; date: string; scope: string; name: string; question: string; outcome: string; yesPct: number; turnout: number; note: string | null }[];
};

// ---------------- loaders ----------------
function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf-8")) as T;
}
let _core: UkElectionsFile | null = null;
let _trends: UkElectionTrends | null = null;
export function getUkElections(): UkElectionsFile {
  return (_core ??= readJson<UkElectionsFile>("uk-elections.json"));
}
export function getUkElectionTrends(): UkElectionTrends {
  return (_trends ??= readJson<UkElectionTrends>("uk-elections-trends.json"));
}

const GH = "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/";

// The historical core and trends files only change at general elections, so
// they stay build-time reads. The beyond-Westminster file (mayoral contests,
// devolved elections, locals) updates several times a year: dev reads the
// working tree so local edits show at once; prod ISR-fetches GitHub raw so a
// `[vercel skip]` data commit surfaces within the hour, no rebuild. Same
// pattern as lib/ukPolitics and the Zone Zero Cup.
export async function getUkElectionsBeyond(): Promise<UkElectionsBeyond> {
  const local = (): UkElectionsBeyond | null => {
    try {
      return readJson<UkElectionsBeyond>("uk-elections-beyond.json");
    } catch {
      return null;
    }
  };
  if (process.env.NODE_ENV !== "production") {
    const l = local();
    if (l !== null) return l;
  }
  try {
    const r = await fetch(GH + "uk-elections-beyond.json", { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as UkElectionsBeyond;
  } catch {
    /* fall through to local */
  }
  const l = local();
  if (l === null) throw new Error("uk-elections-beyond.json unavailable locally and from raw");
  return l;
}

// ---------------- party colors ----------------
// Extends the sitewide convention (see uk-political-leadership) with the
// historical factions that appear in the 1802-2024 dataset. Political identity
// colors are fixed by convention; names always accompany the color.
const P: Record<string, string> = {
  Conservative: "#0087DC", Tory: "#2E6FA8", "Tory (Pittite)": "#2E6FA8", "Ultra-Tories": "#1D4ED8",
  "Conservative and Liberal Unionist": "#0087DC",
  Labour: "#E4003B", "Labour Repr. Cmte.": "#E4003B", "National Labour": "#95264E",
  Whig: "#F58220", Foxite: "#F58220", Grenvillite: "#B8860B", Addingtonian: "#7C90A0",
  Liberal: "#FAA61A", "Liberal Democrats": "#FAA61A", "Liberal Democrat": "#FAA61A",
  "Coalition Liberal": "#D9A038", "National Liberal": "#C2932F", "Liberal National": "#C2932F",
  "Independent Liberals": "#E8B04B", Peelite: "#7c3aed",
  "Irish Parliamentary": "#169b62", "Home Rule": "#169b62", "Irish Repeal": "#169b62",
  "Irish National Federation": "#169b62", "All-for-Ireland": "#0E7A50",
  "Sinn Féin": "#326760", SNP: "#FDF38E", "Scottish National Party": "#FDF38E",
  "Plaid Cymru": "#005B54", "SNP & Plaid Cymru": "#FDF38E",
  Reform: "#12B6CF", "Reform UK": "#12B6CF",
  Green: "#6AB023", "Green Party": "#6AB023", "Green Party of England and Wales": "#6AB023",
  "Democratic Unionist": "#D46A4C", DUP: "#D46A4C", "Ulster Unionist": "#9999FF", UUP: "#9999FF",
  SDLP: "#2AA82C", Alliance: "#F6CB2F", TUV: "#0d3b66",
  Independents: "#6b7280", Independent: "#6b7280", National: "#8A7CA8", Coalition: "#8A7CA8",
  Speaker: "#4b5563", Other: "#6b7280", Others: "#6b7280",
  // workbook short codes (beyond-Westminster tables)
  CON: "#0087DC", Con: "#0087DC", LAB: "#E4003B", Lab: "#E4003B", LD: "#FAA61A",
  GRN: "#6AB023", UKIP: "#70147A", Ukip: "#70147A", BNP: "#2F3A52", Brexit: "#12B6CF",
  PC: "#005B54", "PC/SNP": "#FDF38E", IND: "#6b7280", CG: "#8a8f98", "Liberal/Lib Dem": "#FAA61A",
};
export function partyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  return P[name] ?? P[name.replace(/\s+Party$/i, "").trim()] ?? "#9ca3af";
}

// ---------------- helpers ----------------
export function eraOf(key: string) {
  return getUkElections().eras.find((e) => e.key === key) ?? null;
}
export function electionById(id: string): UkElection | null {
  return getUkElections().elections.find((e) => e.id === id) ?? null;
}
export function neighbours(id: string): { prev: UkElection | null; next: UkElection | null } {
  const els = getUkElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const fmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records & superlatives, computed from the dataset (no hand-entered figures).
export type UkElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function computeRecords(): UkElectionRecord[] {
  const els = getUkElections().elections;
  const recs: UkElectionRecord[] = [];
  // 1918+ only: earlier turnout figures describe a far narrower franchise.
  const withTurnout = els.filter((e) => e.turnout != null && e.year >= 1918);
  const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
  const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
  recs.push({ label: "Highest turnout since 1918", value: fmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label} general election` });
  recs.push({ label: "Lowest turnout since 1918", value: fmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label} general election` });
  const withGov = els.filter((e) => e.government?.majority != null);
  const bigMaj = withGov.reduce((a, b) => ((a.government!.majority ?? 0) >= (b.government!.majority ?? 0) ? a : b));
  recs.push({ label: "Largest majority since 1918", value: String(bigMaj.government!.majority), electionId: bigMaj.id, detail: `${bigMaj.government!.party}, ${bigMaj.label}` });
  const mostVotes = els
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.votes != null)
    .reduce((a, b) => ((a.p.votes ?? 0) >= (b.p.votes ?? 0) ? a : b));
  recs.push({ label: "Most votes for one party", value: fmtInt(mostVotes.p.votes), electionId: mostVotes.e.id, detail: `${mostVotes.p.name}, ${mostVotes.e.label}` });
  const mostSeats = els
    .filter((e) => e.year >= 1918)
    .flatMap((e) => e.parties.map((p) => ({ e, p })))
    .filter((x) => x.p.seats != null)
    .reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
  recs.push({ label: "Most seats since 1918", value: fmtInt(mostSeats.p.seats), electionId: mostSeats.e.id, detail: `${mostSeats.p.name}, ${mostSeats.e.label}` });
  // most disproportional: winner's seat share minus vote share, where both known
  const disp = els
    .map((e) => {
      const w = e.parties.find((p) => p.name === e.seatLeader);
      if (!w || w.share == null || w.seats == null || !e.totalSeats) return null;
      return { e, gap: (w.seats / e.totalSeats) * 100 - w.share, w };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.e.year >= 1918)
    .reduce((a, b) => (a.gap >= b.gap ? a : b));
  recs.push({
    label: "Biggest winner's bonus",
    value: `+${disp.gap.toFixed(1)} pts`,
    electionId: disp.e.id,
    detail: `${disp.w.name} turned ${fmtPct(disp.w.share)} of votes into ${(((disp.w.seats ?? 0) / disp.e.totalSeats) * 100).toFixed(1)}% of seats, ${disp.e.label}`,
  });
  return recs;
}

// ---------------- constituency results (1918+) ----------------
// One file per election under public/data/uk-const/, built from the Commons
// Library constituency results dataset (party families only: con/lib/lab/
// nat/oth; -1 in the source = returned unopposed). Row shape:
// [name, region, electorate, totalVotes, turnoutPct, conS, libS, labS, natS, othS, winnerIdx, unopposed]
export type UkConstRow = [
  string, string, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null, number | null,
  number | null, number,
];
export type UkConstituencyFile = {
  id: string;
  boundarySet: string;
  families: string[];
  labels: Record<string, string>;
  n: number;
  unopposed: number;
  led: Record<string, number>;
  regions: {
    name: string;
    n: number;
    shares: Record<string, number | null>;
    led: Record<string, number>;
    turnout: number | null;
  }[];
  superlatives: {
    highestTurnout?: { name: string; region: string; value: number };
    lowestTurnout?: { name: string; region: string; value: number };
    biggestWin?: { name: string; region: string; family: string; value: number };
    closest?: { name: string; region: string; family: string | null; value: number };
  };
  rows: UkConstRow[];
};
export function getUkConstituencies(id: string): UkConstituencyFile | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "uk-const", `${id}.json`), "utf-8"),
    ) as UkConstituencyFile;
  } catch {
    return null;
  }
}
// Family colors for the constituency tables (matches partyColor conventions).
export const UK_FAMILY_COLORS: Record<string, string> = {
  con: "#0087DC", lib: "#FAA61A", lab: "#E4003B", nat: "#FDF38E", oth: "#8A7CA8",
};
