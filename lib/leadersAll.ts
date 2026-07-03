// lib/leadersAll.ts
// Server-side assembler for the /leaders directory. Produces one master list of
// every current leader we track (sovereign states, constituents/territories, and
// intergovernmental organisations) plus compact per-office history so the client
// can answer "who held this office in month/year X?".
import "server-only";
import fs from "fs";
import path from "path";
import { getCountry } from "./countries";
import { getCurrentLeaderOverlay } from "./currentLeaders";
import { ORG_DEFS } from "./orgs";
import type { HistRow } from "./leaderRules";

const LEADERS_DIR = path.join(process.cwd(), "public", "data", "leaders");

// Commonwealth realms share the British monarch as head of state. Their own
// history files carry only prime ministers (or nothing yet), so the sovereign
// is resolved from a single shared timeline instead — see getMonarchTimeline().
export const REALM_SLUGS = new Set<string>([
  "united-kingdom", "canada", "australia", "new-zealand", "jamaica", "bahamas",
  "belize", "grenada", "papua-new-guinea", "solomon-islands", "tuvalu",
  "antigua-barbuda", "st-kitts-nevis", "st-lucia", "st-vincent-the-grenadines",
]);

export type EntityType = "sovereign" | "territory" | "org";
export type CurrentLeader = {
  name: string;
  role: string;
  since?: string;
  second?: { name: string; role: string };
};
export type LeaderEntity = {
  slug: string;            // country slug or org key
  name: string;            // display name
  type: EntityType;
  continent: string | null; // countries: continent; orgs: "Intergovernmental"
  parentName: string | null; // territory's parent, else null
  scoreTotal: number | null; // composite country score (orgs: null)
  realm: boolean;          // shares the British monarch as head of state
  orgs: string[];          // org-membership abbreviations (countries only)
  country: string | null;  // org leader's nationality (orgs only)
  href: string | null;     // link target
  hasHistory: boolean;     // can we time-travel this entity?
  current: CurrentLeader | null;
  history: HistRow[];      // compact {n,r,s,e}
};

function readJSON<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; } catch { return null; }
}

function compact(rows: Array<{ name: string; role: string; start: string | null; end: string | null }>): HistRow[] {
  return rows
    .map((r) => ({ n: r.name, r: r.role, s: r.start ?? null, e: r.end ?? null }))
    .filter((h) => h.s != null);
}

const ORG_LABEL: Record<string, string> = Object.fromEntries(
  ORG_DEFS.map((o) => [o.key, o.label]),
);

// The British monarch succession, lifted from the UK history file, applied to
// every Commonwealth realm so the sovereign changes correctly through time.
export function getMonarchTimeline(): HistRow[] {
  const uk = readJSON<Array<{ name: string; role: string; start: string | null; end: string | null }>>(
    path.join(LEADERS_DIR, "united-kingdom.json"),
  ) ?? [];
  return compact(uk.filter((r) => /Sovereign|Monarch/.test(r.role)));
}

export async function getLeadersMaster(): Promise<LeaderEntity[]> {
  const localCurrent =
    readJSON<Record<string, CurrentLeader>>(path.join(LEADERS_DIR, "_current.json")) ?? {};
  let overlay: Record<string, CurrentLeader> = {};
  try { overlay = await getCurrentLeaderOverlay(); } catch { overlay = {}; }
  const orgsMap =
    readJSON<Record<string, Record<string, string>>>(
      path.join(process.cwd(), "data", "country-orgs.json"),
    ) ?? {};
  const orgLeaders =
    readJSON<Record<string, { office: string; current?: { name: string; role: string; since?: string; country?: string }; history?: Array<{ name: string; role: string; start: string | null; end: string | null }> }>>(
      path.join(process.cwd(), "public", "data", "org-leaders.json"),
    ) ?? {};

  const out: LeaderEntity[] = [];

  // Countries + territories, keyed off the current-leader snapshot.
  for (const slug of Object.keys(localCurrent)) {
    const c = getCountry(slug);
    const histRows =
      readJSON<Array<{ name: string; role: string; start: string | null; end: string | null }>>(
        path.join(LEADERS_DIR, `${slug}.json`),
      );
    const hasHistory = Array.isArray(histRows) && histRows.length > 0;
    const membership = orgsMap[slug]
      ? Object.entries(orgsMap[slug])
          .filter(([, status]) => status === "Member")
          .map(([k]) => k)
          .sort()
      : [];
    out.push({
      slug,
      name: c?.name ?? slug,
      type: c?.parent_slug ? "territory" : "sovereign",
      continent: c?.continent ?? null,
      parentName: c?.parent ?? null,
      scoreTotal: c?.scoreTotal ?? null,
      realm: REALM_SLUGS.has(slug),
      orgs: membership,
      country: null,
      href: `/countries/${slug}`,
      hasHistory,
      current: overlay[slug] ?? localCurrent[slug] ?? null,
      history: hasHistory ? compact(histRows!) : [],
    });
  }

  // Intergovernmental organisations.
  for (const key of Object.keys(orgLeaders)) {
    const o = orgLeaders[key];
    const cur = o.current
      ? {
          name: o.current.name,
          role: o.current.role,
          ...(o.current.since ? { since: o.current.since } : {}),
        }
      : null;
    out.push({
      slug: key,
      name: ORG_LABEL[key] ?? key,
      type: "org",
      continent: "Intergovernmental",
      parentName: null,
      scoreTotal: null,
      realm: false,
      orgs: [],
      country: o.current?.country ?? null,
      href: null,
      hasHistory: Array.isArray(o.history) && o.history.length > 0,
      current: cur,
      history: Array.isArray(o.history) ? compact(o.history) : [],
    });
  }

  return out;
}
