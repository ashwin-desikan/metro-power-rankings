import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Forbes real-time billionaires via the free rtb-api (komed3/rtb-api, MIT). A
// monthly GitHub Action rebuilds public/data/billionaires.json and commits it
// with [vercel skip]; pages read it here via ISR from GitHub raw (monthly
// revalidate) with a build-time fallback, so it updates with no deploy.

export type Billionaire = {
  rank: number | null;
  name: string;
  uri: string;
  networth: number | null; // millions USD
  countryCode: string | null;
  countrySlug: string | null;
  countryName: string | null;
  industries: string[];
  selfMade: boolean | null;
  age: number | null;
  source: string[];
};
type BillionairesFile = { generated: string | null; source: string; count: number; billionaires: Billionaire[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/billionaires.json";

export async function getBillionaires(): Promise<Billionaire[]> {
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (res.ok) {
      const d = (await res.json()) as BillionairesFile;
      if (d?.billionaires?.length) return d.billionaires;
    }
  } catch {
    /* fall through */
  }
  try {
    const d = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "billionaires.json"), "utf-8"),
    ) as BillionairesFile;
    return d.billionaires ?? [];
  } catch {
    return [];
  }
}

export function billionairesForCountry(all: Billionaire[], slug: string): Billionaire[] {
  return all
    .filter((b) => b.countrySlug === slug)
    .sort((a, b) => (b.networth ?? 0) - (a.networth ?? 0));
}

export function fmtWorth(m: number | null): string {
  if (m == null) return "—";
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
  return `$${m.toFixed(0)}M`;
}

export function forbesUrl(uri: string): string {
  return `https://www.forbes.com/profile/${uri}/`;
}
