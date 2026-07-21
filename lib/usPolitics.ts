import "server-only";
import fs from "fs";
import path from "path";

export type Official = { name: string; party?: string; since?: string };
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
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (res.ok) return (await res.json()) as UsCongress;
  } catch {
    /* fall through to build-time copy */
  }
  try {
    const file = path.join(process.cwd(), "public", "data", "us-congress.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as UsCongress;
  } catch {
    return null;
  }
}
