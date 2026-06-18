import "server-only";

// Audience Builder data layer (/studio/audience-builder).
//
// Source: scripts/build_audience_profiles.py emits
// public/data/audience/profiles.json, one activation-ready record per metro:
// 16 dimension percentiles, a handful of firmographic-style attributes, and a
// SYNTHETIC consent/suppression state that exists only to make the governance
// gate demonstrable. Metros are the stand-in first-party audience.
//
// Server-only. Registered in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type Consent = "opted_in" | "opted_out" | "unknown";

export type AudienceProfile = {
  slug: string;
  name: string;
  country: string;
  region: string;
  continent: string;
  capital: boolean;
  attrs: {
    rank: number | null;
    pop: number | null;
    gdpPerCapita: number | null;
    majorTeams: number | null;
    companies: number | null;
    skyscrapers: number | null;
    marketCap: number | null;
  };
  dims: Record<string, number>; // dimension key -> percentile 0..100
  governance: { consent: Consent; suppressed: boolean };
};

let _profiles: AudienceProfile[] | null = null;

export function getAudienceProfiles(): AudienceProfile[] {
  if (_profiles) return _profiles;
  const p = join(process.cwd(), "public", "data", "audience", "profiles.json");
  _profiles = existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf-8")) as AudienceProfile[])
    : [];
  return _profiles;
}
