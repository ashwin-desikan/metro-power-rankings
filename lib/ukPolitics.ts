import "server-only";
import fs from "fs";
import path from "path";
import { getLeaders } from "@/lib/leaders";

export type UkDated = {
  name: string;
  party: string | null;
  start: string;
  end: string | null;
  note?: string;
};
export type UkChamber = {
  name: string;
  start: string;
  end: string;
  total: number;
  parties: { party: string; seats: number }[];
};
export type UkOffices = {
  chancellor: UkDated[];
  foreignSecretary: UkDated[];
  homeSecretary: UkDated[];
  deputyPrimeMinister: UkDated[];
  leaderOfOpposition: UkDated[];
  firstMinisterScotland: UkDated[];
  firstMinisterWales: UkDated[];
  firstMinisterNorthernIreland: UkDated[];
};

const stripCrown = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();
function splitParty(p: string | null): { party: string | null; note?: string } {
  if (!p) return { party: null };
  const [party, ...rest] = p.split(";");
  return { party: party.trim() || null, note: rest.join(";").trim() || undefined };
}

// PM + Sovereign come from the existing, auto-maintained /leaders data
// (public/data/leaders/united-kingdom.json) -- NOT a duplicate file.
export function getUkPmAndSovereign(): { sovereigns: UkDated[]; primeMinisters: UkDated[] } {
  const leaders = getLeaders("united-kingdom");
  const map = (role: string, keepParty: boolean): UkDated[] =>
    leaders
      .filter((l) => l.role === role && l.start)
      .map((l) => {
        const sp = splitParty(l.party);
        return {
          name: stripCrown(l.name),
          party: keepParty ? sp.party : null,
          start: l.start as string,
          end: l.end,
          note: sp.note,
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  return { sovereigns: map("Sovereign", false), primeMinisters: map("Prime Minister", true) };
}

const GH =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/";

// Dev reads the working-tree file (local edits show at once); prod ISR-fetches
// GitHub raw so weekly refreshes surface without a rebuild. Same as usPolitics.
async function readHistory<T>(file: string, fallback: T): Promise<T> {
  const local = (): T | null => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf-8"),
      ) as T;
    } catch {
      return null;
    }
  };
  if (process.env.NODE_ENV !== "production") {
    const l = local();
    if (l !== null) return l;
  }
  try {
    const r = await fetch(GH + file, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as T;
  } catch {
    /* fall through */
  }
  const l = local();
  return l !== null ? l : fallback;
}

const EMPTY_OFFICES: UkOffices = {
  chancellor: [], foreignSecretary: [], homeSecretary: [], deputyPrimeMinister: [],
  leaderOfOpposition: [], firstMinisterScotland: [], firstMinisterWales: [],
  firstMinisterNorthernIreland: [],
};

export async function getUkOffices(): Promise<UkOffices> {
  const d = await readHistory<Partial<UkOffices>>("uk-offices-history.json", {});
  return { ...EMPTY_OFFICES, ...d };
}

export async function getUkCommonsHistory(): Promise<UkChamber[]> {
  const d = await readHistory<{ parliaments?: UkChamber[] }>("uk-commons-history.json", {});
  return d.parliaments ?? [];
}

export async function getUkLordsHistory(): Promise<UkChamber[]> {
  const d = await readHistory<{ periods?: UkChamber[] }>("uk-lords-history.json", {});
  return d.periods ?? [];
}
