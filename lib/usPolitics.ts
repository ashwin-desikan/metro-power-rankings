import "server-only";
import fs from "fs";
import path from "path";

export type Official = { name: string; party?: string; since?: string; acting?: boolean };
export type CabinetMember = { office: string; name: string; since?: string; acting?: boolean };
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

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/us-congress.json";

// Fetched at runtime via ISR from GitHub raw so the weekly civic-data-refresh
// updates appear with NO Vercel build; the committed file is the build-time
// fallback when the fetch fails.
export async function getUsCongress(): Promise<UsCongress | null> {
  const local = (): UsCongress | null => {
    try {
      const file = path.join(process.cwd(), "public", "data", "us-congress.json");
      return JSON.parse(fs.readFileSync(file, "utf-8")) as UsCongress;
    } catch {
      return null;
    }
  };
  // In dev, read the working-tree file so local edits show immediately. In prod,
  // ISR-fetch from GitHub raw so the weekly refresh appears with NO Vercel build.
  if (process.env.NODE_ENV !== "production") {
    const l = local();
    if (l) return l;
  }
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (res.ok) return (await res.json()) as UsCongress;
  } catch {
    /* fall through to build-time copy */
  }
  return local();
}


export type DatedOffice = { name: string; party: string; start: string; end: string | null };
export type HouseCongress = {
  congress: number;
  years: string;
  start: string;
  end: string;
  total: number;
  parties: { party: string; seats: number }[];
};

const GH_DATA_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/";

// ISR-read a time-machine history file from GitHub raw so the weekly civic-refresh
// commits (which sync officeholder changes into these files) surface with NO
// rebuild -- exactly like getUsCongress() does for the current-state snapshot.
// Falls back to the build-time committed copy when the fetch fails.
async function readHistoryFile<T>(file: string, fallback: T): Promise<T> {
  const local = (): T | null => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf-8"),
      ) as T;
    } catch {
      return null;
    }
  };
  // Dev: working-tree file (local edits show at once). Prod: ISR from GitHub raw.
  if (process.env.NODE_ENV !== "production") {
    const l = local();
    if (l !== null) return l;
  }
  try {
    const res = await fetch(GH_DATA_BASE + file, { next: { revalidate: 3600 } });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through to the committed copy */
  }
  const l = local();
  return l !== null ? l : fallback;
}

export async function getExecutiveHistory(): Promise<{
  presidents: DatedOffice[];
  vicePresidents: DatedOffice[];
}> {
  return readHistoryFile("us-executive-history.json", {
    presidents: [] as DatedOffice[],
    vicePresidents: [] as DatedOffice[],
  });
}

export async function getHouseHistory(): Promise<HouseCongress[]> {
  return readHistoryFile<HouseCongress[]>("us-house-history.json", []);
}

export type SenateTerm = {
  name: string;
  state: string;
  class: number;
  party: string;
  start: string;
  end: string | null;
};

export async function getSenateHistory(): Promise<SenateTerm[]> {
  const parsed = await readHistoryFile<{ terms?: SenateTerm[] }>(
    "us-senate-history.json",
    {},
  );
  return parsed.terms ?? [];
}

export type CabinetOfficeHistory = { office: string; holders: DatedOffice[] };

export async function getCabinetHistory(): Promise<CabinetOfficeHistory[]> {
  const parsed = await readHistoryFile<{
    offices?: string[];
    cabinet?: Record<string, DatedOffice[]>;
  }>("us-cabinet-history.json", {});
  const cab = parsed.cabinet ?? {};
  const offices = parsed.offices ?? Object.keys(cab);
  return offices.map((office) => ({ office, holders: cab[office] ?? [] }));
}

export async function getGovernorHistory(): Promise<Record<string, DatedOffice[]>> {
  const parsed = await readHistoryFile<{
    governors?: Record<string, DatedOffice[]>;
  }>("us-governor-history.json", {});
  return parsed.governors ?? {};
}
