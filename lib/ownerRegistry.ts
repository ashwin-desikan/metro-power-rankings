import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Canonical owner/entity registry -- fixes multi-club ownership detection.
//
// scripts/data/team-owners-seed.json groups franchises into a control
// portfolio purely by an exact string match on owner_key (see
// lib/teamOwners.ts). When the SAME person or holding company controls two
// clubs under two DIFFERENT display names -- Wes Edens is "Wes Edens" at the
// Milwaukee Bucks but part of "V Sports" at Aston Villa -- the rows land in
// separate portfolios and the site shows no multi-club link, even though the
// seed's own prose notes the connection. Added 2026-09-24.
//
// scripts/data/owner-registry.json is the source of truth: each entity lists
// every alias owner_key it appears under (folded into one canonical portfolio
// by canonicalOwnerKey() below) plus every club it holds, control or minority
// (used by getMultiClubLinksFor() to badge cross-links that the portfolio
// grouping intentionally does NOT merge, per the seed's one-control-entity-
// per-franchise rule -- a minority stake must never inflate another owner's
// portfolio total).

export type RegistryClub = {
  team: string;
  league: string;
  role: "control" | "minority";
  note?: string;
};

export type RegistryEntity = {
  id: string;
  displayName: string;
  aliasNames: string[];
  aliasOwnerKeys: string[];
  clubs: RegistryClub[];
  note?: string;
};

type RegistryFile = { generated?: string; entities: RegistryEntity[] };

function loadRaw(): RegistryFile {
  const file = join(process.cwd(), "scripts", "data", "owner-registry.json");
  return JSON.parse(readFileSync(file, "utf8")) as RegistryFile;
}

let _entities: RegistryEntity[] | null = null;
let _byOwnerKey: Map<string, RegistryEntity> | null = null;
let _byTeam: Map<string, RegistryEntity[]> | null = null;

const teamKey = (team: string, league: string) => `${team} ${league}`;

function build() {
  if (_entities && _byOwnerKey && _byTeam) return;
  const file = loadRaw();
  _entities = file.entities ?? [];
  _byOwnerKey = new Map();
  _byTeam = new Map();
  for (const e of _entities) {
    for (const key of e.aliasOwnerKeys) _byOwnerKey.set(key, e);
    for (const c of e.clubs) {
      const k = teamKey(c.team, c.league);
      const list = _byTeam.get(k);
      if (list) list.push(e);
      else _byTeam.set(k, [e]);
    }
  }
}

/**
 * The canonical grouping key for a raw owner_key, for portfolio rollups.
 * Only CONTROL-role aliases are eligible to fold together (a minority stake
 * must never merge into someone else's control portfolio). Falls back to the
 * raw owner_key unchanged when it has no registry entry, so every seed row
 * not covered by the registry behaves exactly as before this file existed.
 */
export function canonicalOwnerKey(ownerKey: string, team: string, league: string): string {
  build();
  const entity = _byOwnerKey!.get(ownerKey);
  if (!entity) return ownerKey;
  const club = entity.clubs.find((c) => c.team === team && c.league === league);
  if (club && club.role === "control") return entity.id;
  return ownerKey;
}

export function registryDisplayNameFor(canonicalKey: string): string | null {
  build();
  const entity = _entities!.find((e) => e.id === canonicalKey);
  return entity?.displayName ?? null;
}

/**
 * Every OTHER club (control or minority) a registry entity links to this
 * team through, for the "multi-club" badge on a team row that the portfolio
 * grouping itself does not cover (minority stakes, or an entity intentionally
 * not folded into one portfolio). Returns [] for a team with no registry hit.
 */
export function getMultiClubLinksFor(team: string, league: string): {
  entity: string;
  role: RegistryClub["role"];
  otherClubs: RegistryClub[];
}[] {
  build();
  const hits = _byTeam!.get(teamKey(team, league)) ?? [];
  return hits.map((e) => {
    const mine = e.clubs.find((c) => c.team === team && c.league === league)!;
    return {
      entity: e.displayName,
      role: mine.role,
      otherClubs: e.clubs.filter((c) => !(c.team === team && c.league === league)),
    };
  }).filter((x) => x.otherClubs.length > 0);
}

export function getAllRegistryEntities(): RegistryEntity[] {
  build();
  return _entities!;
}
