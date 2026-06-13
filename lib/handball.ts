import "server-only";

// International handball data layer (/teams/handball). Olympics (ultimate) +
// IHF World Championship. Built by scripts/intl_sport/build_worlds_portal.py.
// Thin wrapper over the shared two-tier portal factory.

import { makeWorldsPortal } from "@/lib/worldsPortal";
export type {
  WorldsNation as HandballNation,
  WorldsDetail as HandballDetail,
  WorldsHub as HandballHub,
} from "@/lib/worldsPortal";

const portal = makeWorldsPortal("handball");

export const getAllHandballTeams = portal.getAllTeams;
export const getHandballHub = portal.getHub;
export const getHandballTeamBySlug = portal.getTeamBySlug;
export const getAllHandballSlugs = portal.getAllSlugs;
export const getHandballTeamDetail = portal.getTeamDetail;
export const getHandballTeamForCountry = portal.getTeamForCountry;
export const getCountrySlugForHandballTeam = portal.getCountrySlugForTeam;
