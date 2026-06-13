import "server-only";

// International volleyball data layer (/teams/volleyball). Olympics (ultimate) +
// FIVB World Championship. Built by scripts/intl_sport/build_worlds_portal.py.
// Thin wrapper over the shared two-tier portal factory.

import { makeWorldsPortal } from "@/lib/worldsPortal";
export type {
  WorldsNation as VolleyballNation,
  WorldsDetail as VolleyballDetail,
  WorldsHub as VolleyballHub,
} from "@/lib/worldsPortal";

const portal = makeWorldsPortal("volleyball");

export const getAllVolleyballTeams = portal.getAllTeams;
export const getVolleyballHub = portal.getHub;
export const getVolleyballTeamBySlug = portal.getTeamBySlug;
export const getAllVolleyballSlugs = portal.getAllSlugs;
export const getVolleyballTeamDetail = portal.getTeamDetail;
export const getVolleyballTeamForCountry = portal.getTeamForCountry;
export const getCountrySlugForVolleyballTeam = portal.getCountrySlugForTeam;
