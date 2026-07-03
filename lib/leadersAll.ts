// lib/leadersAll.ts
// Server-side assembler for the /leaders directory: sovereign states,
// constituents, intergovernmental organisations, and defunct historical states,
// each with compact per-office history for the time machine. Also carries a
// per-entity historical-name timeline (Russia→Soviet Union, Germany→Nazi
// Germany, ...) resolved by date on the client.
import "server-only";
import fs from "fs";
import path from "path";
import { getCountry } from "./countries";
import { getCurrentLeaderOverlay } from "./currentLeaders";
import { ORG_DEFS } from "./orgs";
import type { HistRow } from "./leaderRules";

const LEADERS_DIR = path.join(process.cwd(), "public", "data", "leaders");

export const REALM_SLUGS = new Set<string>([
  "united-kingdom", "canada", "australia", "new-zealand", "jamaica", "bahamas",
  "belize", "grenada", "papua-new-guinea", "solomon-islands", "tuvalu",
  "antigua-barbuda", "st-kitts-nevis", "st-lucia", "st-vincent-the-grenadines",
]);

// Non-sovereign, governor-led dependencies: excluded from the leaders directory
// (we track sovereign heads of state/government, not appointed governors).
const GOVERNOR_TERRITORIES = new Set<string>([
  "puerto-rico", "guam", "american-samoa", "us-virgin-islands", "northern-mariana-islands",
]);
// Formerly sovereign kingdoms that merged away (into Great Britain in 1707):
// shown for their sovereign era only, with no current leader.
const FORMER_SOVEREIGN = new Set<string>(["england", "scotland"]);

export type EntityType = "sovereign" | "territory" | "org" | "defunct";
export type CurrentLeader = {
  name: string;
  role: string;
  since?: string;
  second?: { name: string; role: string };
};
export type NamePeriod = { name: string; start: string | null; end: string | null; flag: string | null };
export type LeaderEntity = {
  slug: string;
  name: string;
  type: EntityType;
  continent: string | null;
  parentName: string | null;
  scoreTotal: number | null;
  realm: boolean;
  yearRange: string | null;
  nameHistory: NamePeriod[] | null;
  orgs: string[];
  country: string | null;
  href: string | null;
  hasHistory: boolean;
  current: CurrentLeader | null;
  history: HistRow[];
};

function readJSON<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; } catch { return null; }
}

function fmtDefunctYear(v: string): string {
  const neg = v.startsWith("-");
  const y = parseInt(neg ? v.slice(1) : v, 10);
  return neg ? `${y} BC` : String(y);
}

function compact(rows: Array<{ name: string; role: string; start: string | null; end: string | null }>): HistRow[] {
  return rows
    .map((r) => ({ n: r.name, r: r.role ?? "", s: r.start ?? null, e: r.end ?? null }))
    .filter((h) => h.s != null);
}

const ORG_LABEL: Record<string, string> = Object.fromEntries(
  ORG_DEFS.map((o) => [o.key, o.label]),
);

export function getMonarchTimeline(): HistRow[] {
  const uk = readJSON<Array<{ name: string; role: string; start: string | null; end: string | null }>>(
    path.join(LEADERS_DIR, "united-kingdom.json"),
  ) ?? [];
  return compact(uk.filter((r) => /Sovereign|Monarch/.test(r.role)));
}

type DefunctMeta = { name: string; continent: string | null; start: string; end: string; href?: string };
type RawNamePeriod = { name: string; start?: string; end?: string; flag?: string };

function normNames(list: RawNamePeriod[] | undefined): NamePeriod[] | null {
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((n) => ({ name: n.name, start: n.start ?? null, end: n.end ?? null, flag: n.flag ?? null }));
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
  const defunct = readJSON<Record<string, DefunctMeta>>(path.join(LEADERS_DIR, "_defunct.json")) ?? {};
  const names = readJSON<Record<string, RawNamePeriod[]>>(path.join(LEADERS_DIR, "_names.json")) ?? {};

  const out: LeaderEntity[] = [];

  for (const slug of Object.keys(localCurrent)) {
    if (GOVERNOR_TERRITORIES.has(slug)) continue; // appointed governors, not sovereign
    const c = getCountry(slug);
    const histRows =
      readJSON<Array<{ name: string; role: string; start: string | null; end: string | null }>>(
        path.join(LEADERS_DIR, `${slug}.json`),
      );
    const hasHistory = Array.isArray(histRows) && histRows.length > 0;
    const history = hasHistory ? compact(histRows!) : [];
    const isFormer = FORMER_SOVEREIGN.has(slug);
    const membership = orgsMap[slug]
      ? Object.entries(orgsMap[slug])
          .filter(([, status]) => status === "Member")
          .map(([k]) => k)
          .sort()
      : [];
    let yearRange: string | null = null;
    if (history.length) {
      const starts = history.map((h) => h.s).filter(Boolean) as string[];
      if (starts.length) {
        const earliest = Math.min(
          ...starts.map((d) => (d.startsWith("-") ? -parseInt(d.slice(1, 5), 10) : parseInt(d.slice(0, 4), 10))),
        );
        // Current countries show "<earliest>–" (open-ended); former sovereigns keep their end year.
        yearRange = isFormer ? `${earliest}–1707` : `${earliest < 0 ? `${-earliest} BC` : earliest}–`;
      }
    }
    out.push({
      slug,
      name: c?.name ?? slug,
      type: c?.parent_slug ? "territory" : "sovereign",
      continent: c?.continent ?? null,
      parentName: c?.parent ?? null,
      scoreTotal: c?.scoreTotal ?? null,
      realm: REALM_SLUGS.has(slug),
      yearRange,
      nameHistory: normNames(names[slug]),
      orgs: membership,
      country: null,
      href: `/countries/${slug}`,
      hasHistory,
      current: isFormer ? null : (overlay[slug] ?? localCurrent[slug] ?? null),
      history,
    });
  }

  for (const key of Object.keys(orgLeaders)) {
    const o = orgLeaders[key];
    const cur = o.current
      ? { name: o.current.name, role: o.current.role, ...(o.current.since ? { since: o.current.since } : {}) }
      : null;
    // Defunct orgs (no current holder) get a year range from their history span.
    let orgYearRange: string | null = null;
    if (Array.isArray(o.history) && o.history.length) {
      const starts = o.history.map((h) => h.start).filter(Boolean) as string[];
      const ends = o.history.map((h) => h.end).filter(Boolean) as string[];
      if (starts.length) {
        const s0 = Math.min(...starts.map((x) => parseInt(x.slice(0, 4), 10)));
        if (cur) {
          // Current orgs: earliest year, open-ended.
          orgYearRange = `${s0}–`;
        } else {
          const e0 = ends.length ? Math.max(...ends.map((x) => parseInt(x.slice(0, 4), 10))) : null;
          orgYearRange = `${s0}–${e0 ?? "present"}`;
        }
      }
    }
    out.push({
      slug: key,
      name: ORG_LABEL[key] ?? key,
      type: "org",
      continent: "Intergovernmental",
      parentName: null,
      scoreTotal: null,
      realm: false,
      yearRange: orgYearRange,
      orgs: [],
      country: o.current?.country ?? null,
      href: null,
      nameHistory: normNames(names[key]),
      hasHistory: Array.isArray(o.history) && o.history.length > 0,
      current: cur,
      history: Array.isArray(o.history) ? compact(o.history) : [],
    });
  }

  for (const slug of Object.keys(defunct)) {
    const meta = defunct[slug];
    const histRows =
      readJSON<Array<{ name: string; role: string; start: string | null; end: string | null }>>(
        path.join(LEADERS_DIR, `${slug}.json`),
      );
    if (!Array.isArray(histRows) || !histRows.length) continue;
    out.push({
      slug,
      name: meta.name,
      type: "defunct",
      continent: meta.continent,
      parentName: null,
      scoreTotal: null,
      realm: false,
      yearRange: `${fmtDefunctYear(meta.start)}–${fmtDefunctYear(meta.end)}`,
      nameHistory: normNames(names[slug]),
      orgs: [],
      country: null,
      href: null,
      hasHistory: true,
      current: null,
      history: compact(histRows),
    });
  }

  return out;
}
