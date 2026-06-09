import "server-only";
import { makeFooty, type FootyFranchise, type FootySeason, type FootyGrandFinal, type FootyMeta, type FootyLadder, type FootyGFResult } from "@/lib/_footy";

export type AflFranchise = FootyFranchise;
export type AflSeason = FootySeason;
export type AflGrandFinal = FootyGrandFinal;
export type AflMeta = FootyMeta;
export type { FootyLadder, FootyGFResult };

const _afl = makeFooty("afl");

export const getAflMeta = _afl.getMeta;
export const getAllAflFranchises = _afl.getAll;
export const getActiveAflFranchises = _afl.getActive;
export const getDefunctAflFranchises = _afl.getDefunct;
export const getAllAflSlugs = _afl.getAllSlugs;
export const getAflFranchiseBySlug = _afl.getBySlug;
export const getAflSeasons = _afl.getSeasons;
export const getAflGrandFinals = _afl.getGrandFinals;
export const getAflFranchiseByTeamName = _afl.getByTeamName;
export const getAflLatestLadder = _afl.getLatestLadder;
export const getAflGrandFinalHistory = _afl.getGrandFinalHistory;
export const aflMonogramFor = _afl.monogramFor;
