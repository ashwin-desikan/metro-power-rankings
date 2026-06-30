import "server-only";
import fs from "fs";
import path from "path";

export type Official = { name: string; party?: string; since?: string };
export type CabinetMember = { office: string; name: string; since?: string };
export type Senator = {
  name: string;
  state: string;
  stateSlug: string;
  party: string;
  class: number;
};
export type HouseLeader = { office: string; name: string; party: string };
export type PartySplit = { note?: string } & Record<string, number | string>;

export type UsCongress = {
  executive: { president: Official; vicePresident: Official; cabinet: CabinetMember[] };
  senate: { partySplit: PartySplit; members: Senator[] };
  house: { partySplit: PartySplit; leadership: HouseLeader[] };
};

let _cache: UsCongress | null = null;
export function getUsCongress(): UsCongress | null {
  if (_cache) return _cache;
  try {
    const file = path.join(process.cwd(), "public", "data", "us-congress.json");
    _cache = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    _cache = null;
  }
  return _cache;
}
