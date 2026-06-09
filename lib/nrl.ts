import "server-only";
import { makeFooty, type FootyFranchise, type FootySeason, type FootyGrandFinal, type FootyMeta, type FootyLadder, type FootyGFResult } from "@/lib/_footy";

export type NrlFranchise = FootyFranchise;
export type NrlSeason = FootySeason;
export type NrlGrandFinal = FootyGrandFinal;
export type NrlMeta = FootyMeta;
export type { FootyLadder, FootyGFResult };

const _nrl = makeFooty("nrl");

export const getNrlMeta = _nrl.getMeta;
export const getAllNrlFranchises = _nrl.getAll;
export const getActiveNrlFranchises = _nrl.getActive;
export const getDefunctNrlFranchises = _nrl.getDefunct;
export const getAllNrlSlugs = _nrl.getAllSlugs;
export const getNrlFranchiseBySlug = _nrl.getBySlug;
export const getNrlSeasons = _nrl.getSeasons;
export const getNrlGrandFinals = _nrl.getGrandFinals;
export const getNrlFranchiseByTeamName = _nrl.getByTeamName;
export const getNrlLatestLadder = _nrl.getLatestLadder;
export const getNrlGrandFinalHistory = _nrl.getGrandFinalHistory;
export const nrlMonogramFor = _nrl.monogramFor;
