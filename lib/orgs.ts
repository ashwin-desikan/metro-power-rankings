// lib/orgs.ts
// Organisation membership metadata + server-side loader.
// country-orgs.json is keyed by country slug → { orgKey: status }.

import fs from "fs";
import path from "path";

// ─── Org status values ────────────────────────────────────────────────────────
export type OrgStatus =
  | "Member"
  | "Candidate"
  | "Applicant"
  | "Observer"
  | "Partner"
  | "Dialogue"
  | "Guest"
  | "Suspended";   // a full member whose participation the organisation has suspended (AU after a coup, Mercosur's Venezuela)

// ─── Organisation definition ─────────────────────────────────────────────────
export type OrgGroup =
  | "Security"
  | "Political & Economic"
  | "Regional"
  | "Subregional"
  | "Trade"
  | "Energy";

export type OrgDef = {
  key: string;        // matches CSV column header
  label: string;      // full name
  abbr: string;       // short badge label
  group: OrgGroup;
  href: string;       // Wikipedia / official URL for tooltip
};

export const ORG_DEFS: OrgDef[] = [
  // Security
  { key: "NATO",         label: "North Atlantic Treaty Organization", abbr: "NATO",   group: "Security",            href: "https://www.nato.int" },
  { key: "CSTO",         label: "Collective Security Treaty Org.",    abbr: "CSTO",   group: "Security",            href: "https://en.wikipedia.org/wiki/Collective_Security_Treaty_Organization" },
  { key: "SCO",          label: "Shanghai Cooperation Organisation",  abbr: "SCO",    group: "Security",            href: "https://en.wikipedia.org/wiki/Shanghai_Cooperation_Organisation" },
  // Political & Economic
  { key: "UN",           label: "United Nations",                     abbr: "UN",     group: "Political & Economic", href: "https://www.un.org" },
  { key: "EU",           label: "European Union",                     abbr: "EU",     group: "Political & Economic", href: "https://europa.eu" },
  { key: "G7",           label: "Group of Seven",                     abbr: "G7",     group: "Political & Economic", href: "https://en.wikipedia.org/wiki/G7" },
  { key: "G20",          label: "Group of Twenty",                    abbr: "G20",    group: "Political & Economic", href: "https://en.wikipedia.org/wiki/G20" },
  { key: "OECD",         label: "Organisation for Economic Co-operation and Development", abbr: "OECD", group: "Political & Economic", href: "https://www.oecd.org" },
  { key: "BRICS+",       label: "BRICS+",                             abbr: "BRICS+", group: "Political & Economic", href: "https://en.wikipedia.org/wiki/BRICS" },
  // Regional
  { key: "ASEAN",        label: "Association of Southeast Asian Nations", abbr: "ASEAN",  group: "Regional", href: "https://asean.org" },
  { key: "African Union",label: "African Union",                      abbr: "AU",     group: "Regional",            href: "https://au.int" },
  { key: "Arab League",  label: "Arab League",                        abbr: "Arab League", group: "Regional",       href: "https://www.leagueofarabstates.net" },
  { key: "OAS",          label: "Organization of American States",    abbr: "OAS",    group: "Regional",            href: "https://www.oas.org" },
  { key: "Commonwealth", label: "Commonwealth of Nations",            abbr: "Commonwealth", group: "Regional",      href: "https://thecommonwealth.org" },
  { key: "GCC",          label: "Gulf Cooperation Council",           abbr: "GCC",    group: "Regional",            href: "https://en.wikipedia.org/wiki/Gulf_Cooperation_Council" },
  { key: "APEC",         label: "Asia-Pacific Economic Cooperation",  abbr: "APEC",   group: "Regional",            href: "https://www.apec.org" },
  // Subregional and trade (2026-09-10; memberships in scripts/data/subregional-orgs.json,
  // merged into country-orgs.json by scripts/build-orgs-extra.py. Ashwin: "why haven't we
  // been tracking Mercosur, ECOWAS, or some of these other more subregional organizations?")
  { key: "Mercosur", label: "Southern Common Market", abbr: "Mercosur", group: "Subregional", href: "https://www.mercosur.int" },
  { key: "ECOWAS", label: "Economic Community of West African States", abbr: "ECOWAS", group: "Subregional", href: "https://www.ecowas.int" },
  { key: "AES", label: "Alliance of Sahel States", abbr: "AES", group: "Subregional", href: "https://en.wikipedia.org/wiki/Alliance_of_Sahel_States" },
  { key: "SADC", label: "Southern African Development Community", abbr: "SADC", group: "Subregional", href: "https://www.sadc.int" },
  { key: "EAC", label: "East African Community", abbr: "EAC", group: "Subregional", href: "https://www.eac.int" },
  { key: "ECCAS", label: "Economic Community of Central African States", abbr: "ECCAS", group: "Subregional", href: "https://ceeac-eccas.org" },
  { key: "IGAD", label: "Intergovernmental Authority on Development", abbr: "IGAD", group: "Subregional", href: "https://igad.int" },
  { key: "AMU", label: "Arab Maghreb Union", abbr: "AMU", group: "Subregional", href: "https://maghrebarabe.org" },
  { key: "CARICOM", label: "Caribbean Community", abbr: "CARICOM", group: "Subregional", href: "https://caricom.org" },
  { key: "SICA", label: "Central American Integration System", abbr: "SICA", group: "Subregional", href: "https://www.sica.int" },
  { key: "CAN", label: "Andean Community", abbr: "CAN", group: "Subregional", href: "https://www.comunidadandina.org" },
  { key: "ALBA", label: "Bolivarian Alliance for the Peoples of Our America", abbr: "ALBA", group: "Subregional", href: "https://en.wikipedia.org/wiki/ALBA" },
  { key: "PIF", label: "Pacific Islands Forum", abbr: "PIF", group: "Subregional", href: "https://forumsec.org" },
  { key: "SAARC", label: "South Asian Association for Regional Cooperation", abbr: "SAARC", group: "Subregional", href: "https://www.saarc-sec.org" },
  { key: "BIMSTEC", label: "Bay of Bengal Initiative for Multi-Sectoral Technical and Economic Cooperation", abbr: "BIMSTEC", group: "Subregional", href: "https://bimstec.org" },
  { key: "EAEU", label: "Eurasian Economic Union", abbr: "EAEU", group: "Subregional", href: "https://eaeunion.org" },
  { key: "CIS", label: "Commonwealth of Independent States", abbr: "CIS", group: "Subregional", href: "https://cis.minsk.by" },
  { key: "OTS", label: "Organization of Turkic States", abbr: "OTS", group: "Subregional", href: "https://www.turkicstates.org" },
  { key: "EFTA", label: "European Free Trade Association", abbr: "EFTA", group: "Subregional", href: "https://www.efta.int" },
  { key: "Nordic Council", label: "Nordic Council", abbr: "Nordic", group: "Subregional", href: "https://www.norden.org" },
  { key: "Benelux", label: "Benelux Union", abbr: "Benelux", group: "Subregional", href: "https://www.benelux.int" },
  { key: "Visegrád", label: "Visegrád Group", abbr: "V4", group: "Subregional", href: "https://www.visegradgroup.eu" },
  { key: "USMCA", label: "United States-Mexico-Canada Agreement", abbr: "USMCA", group: "Trade", href: "https://ustr.gov/usmca" },
  { key: "CPTPP", label: "Comprehensive and Progressive Agreement for Trans-Pacific Partnership", abbr: "CPTPP", group: "Trade", href: "https://en.wikipedia.org/wiki/Comprehensive_and_Progressive_Agreement_for_Trans-Pacific_Partnership" },
  { key: "RCEP", label: "Regional Comprehensive Economic Partnership", abbr: "RCEP", group: "Trade", href: "https://rcepsec.org" },
  // Energy
  { key: "OPEC",         label: "OPEC",                               abbr: "OPEC",   group: "Energy",              href: "https://www.opec.org" },
  { key: "OPEC+",        label: "OPEC+",                              abbr: "OPEC+",  group: "Energy",              href: "https://en.wikipedia.org/wiki/OPEC%2B" },
];

export const ORG_GROUPS: OrgGroup[] = [
  "Security",
  "Political & Economic",
  "Regional",
  "Subregional",
  "Trade",
  "Energy",
];

export const ORG_MAP = Object.fromEntries(ORG_DEFS.map((o) => [o.key, o]));

// ─── Data loader ─────────────────────────────────────────────────────────────
type CountryOrgs = Record<string, OrgStatus>;
export type OrgsMeta = { asOf: string; verified: string; how: string };

let _cache: Record<string, CountryOrgs> | null = null;
let _meta: OrgsMeta | null = null;

function loadAll(): Record<string, CountryOrgs> {
  if (_cache) return _cache;
  const file = path.join(process.cwd(), "public", "data", "country-orgs.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    // `_meta` (the verification date) rides in the same file; it is not a country.
    _meta = (raw._meta as OrgsMeta) ?? null;
    delete raw._meta;
    _cache = raw as Record<string, CountryOrgs>;
  } catch {
    _cache = {};
  }
  return _cache!;
}

/** When the memberships were last verified by hand, and how the monthly check works. */
export function getOrgsMeta(): OrgsMeta | null {
  loadAll();
  return _meta;
}

export function getOrgsForCountry(slug: string): CountryOrgs {
  return loadAll()[slug] ?? {};
}

export function countryHasOrgs(slug: string): boolean {
  return Object.keys(getOrgsForCountry(slug)).length > 0;
}

// ─── Inverted lookup: org → member countries ──────────────────────────────────
export type OrgMember = {
  slug: string;
  status: OrgStatus;
};

/** Returns all countries that have any status in the given org, sorted Members first then alpha. */
export function getOrgMembers(orgKey: string): OrgMember[] {
  const all = loadAll();
  const results: OrgMember[] = [];
  for (const [slug, memberships] of Object.entries(all)) {
    if (memberships[orgKey]) {
      results.push({ slug, status: memberships[orgKey] as OrgStatus });
    }
  }
  const statusOrder: Record<OrgStatus, number> = {
    Member: 0, Suspended: 1, Candidate: 2, Applicant: 3, Observer: 4, Partner: 5, Dialogue: 6, Guest: 7,
  };
  return results.sort((a, b) =>
    (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || a.slug.localeCompare(b.slug)
  );
}

// ─── Status styling ──────────────────────────────────────────────────────────
// Returns Tailwind class strings for each status tier.
export type StatusStyle = {
  badge: string;   // pill classes
  dot: string;     // indicator dot classes
  label: string;   // human-readable label for tooltip
};

export const STATUS_STYLES: Record<OrgStatus, StatusStyle> = {
  Member: {
    badge: "bg-amber-400/20 border border-amber-500/60 text-amber-800 dark:text-amber-300 font-semibold",
    dot:   "bg-amber-500",
    label: "Full Member",
  },
  Candidate: {
    badge: "border border-dashed border-blue-400/70 text-blue-600 dark:text-blue-400",
    dot:   "bg-blue-400",
    label: "Candidate",
  },
  Applicant: {
    badge: "border border-dashed border-sky-400/70 text-sky-600 dark:text-sky-400",
    dot:   "bg-sky-400",
    label: "Applicant",
  },
  Observer: {
    badge: "border border-gray-300/70 text-gray-500 dark:text-gray-400",
    dot:   "bg-gray-400",
    label: "Observer",
  },
  Partner: {
    badge: "border border-orange-300/70 text-orange-600 dark:text-orange-400",
    dot:   "bg-orange-400",
    label: "Partner",
  },
  Dialogue: {
    badge: "border border-gray-300/50 text-gray-400 dark:text-gray-500 italic",
    dot:   "bg-gray-300",
    label: "Dialogue Partner",
  },
  Guest: {
    badge: "border border-dashed border-gray-300/60 text-gray-400 dark:text-gray-500",
    dot:   "bg-gray-300",
    label: "Permanent Guest",
  },
  Suspended: {
    badge: "border border-amber-500/40 text-amber-700/70 dark:text-amber-300/60 line-through",
    dot:   "bg-amber-500/50",
    label: "Member, suspended",
  },
};
