import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type EuGroup = {
  abbr: string;
  name: string;
  seats: number;
  leader: string | null;
  share: number | null; // EU-wide vote share where the source reports it
  votes: number | null;
};
export type EuPresident = { name: string; party: string; office: string };
export type EuCountryRow = {
  name: string;
  total: number;
  byGroup: number[]; // aligned with countries.groups
  detail: (string | null)[] | null; // national parties per group, where the source gives them
};
export type EuCountries = {
  groups: string[];
  note: string | null;
  rows: EuCountryRow[];
};
export type EuElection = {
  id: string;
  label: string;
  year: number;
  date: string;
  era: string;
  totalSeats: number;
  majoritySeats: number;
  turnout: number | null;
  memberStates: number;
  groups: EuGroup[];
  before: EuPresident | null;
  after: EuPresident | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string;
  countries?: EuCountries;
};
export type EuElectionsFile = {
  meta: { title: string; sources: string[]; note: string; built: string };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: EuElection[];
};

// ---------------- loader ----------------
// The record only changes at a European election (next due 2029), so this
// stays a build-time read, like the other election-history core files.
let _core: EuElectionsFile | null = null;
export function getEuElections(): EuElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "eu-elections.json"), "utf-8"),
  ) as EuElectionsFile);
}

// ---------------- group colors ----------------
// Conventional European Parliament group colors; the group family keeps its
// hue across renamings (SOC → PES → S&D, LD → ELDR → ALDE → Renew). Names
// always accompany the color.
const G: Record<string, string> = {
  SOC: "#F0001C", PES: "#F0001C", "S&D": "#F0001C",
  EPP: "#3399FF", "EPP-ED": "#3399FF",
  LD: "#FFD700", LDR: "#FFD700", ELDR: "#FFD700", ALDE: "#FFD700", Renew: "#FFD700",
  ED: "#6495ED",
  COM: "#B71C1C", EUL: "#B71C1C", "EUL & LU": "#B71C1C", "EUL-NGL": "#B71C1C", "The Left": "#B71C1C",
  G: "#57B45F", "G-EFA": "#57B45F",
  EPD: "#0E4C92", EDA: "#0E4C92", UEN: "#0E4C92", ECR: "#0054A5",
  EDD: "#24B9B9", EFD: "#24B9B9", EFDD: "#24B9B9", EN: "#24B9B9", "IND/DEM": "#24B9B9",
  ID: "#2D4B8E", PfE: "#05285D", ESN: "#1F2A44", DR: "#654321",
  RBW: "#74C365", ERA: "#F49AC2", FE: "#0087DC", CDI: "#A0A0A0", TGI: "#A0A0A0",
  NI: "#6b7280",
};
export function euGroupColor(abbr: string | null | undefined): string {
  if (!abbr) return "#9ca3af";
  return G[abbr] ?? "#9ca3af";
}

// The EPP + Socialist "grand coalition" families, for the duopoly trend chart.
export const EU_GRAND_COALITION = new Set(["SOC", "PES", "S&D", "EPP", "EPP-ED"]);

// ---------------- helpers ----------------
export function euEraOf(key: string) {
  return getEuElections().eras.find((e) => e.key === key) ?? null;
}
export function euElectionById(id: string): EuElection | null {
  return getEuElections().elections.find((e) => e.id === id) ?? null;
}
export function euNeighbours(id: string): { prev: EuElection | null; next: EuElection | null } {
  const els = getEuElections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));
export const fmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
