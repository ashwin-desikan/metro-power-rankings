import "server-only";
import fs from "fs";
import path from "path";

export type OrgLeader = {
  name: string;
  role: string;
  start: string | null;
  end: string | null;
  current: boolean;
  tenure: string | null;
  party: string | null; // nationality for org leaders
  era: string | null;
};

export type OrgLeadership = {
  office: string;
  note?: string;
  current: { name: string; role: string; since?: string; country?: string };
  history: OrgLeader[];
};

let _cache: Record<string, OrgLeadership> | null = null;

function loadAll(): Record<string, OrgLeadership> {
  if (_cache) return _cache;
  try {
    const file = path.join(process.cwd(), "public", "data", "org-leaders.json");
    _cache = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    _cache = {};
  }
  return _cache!;
}

export function getOrgLeadership(orgKey: string): OrgLeadership | null {
  return loadAll()[orgKey] ?? null;
}
