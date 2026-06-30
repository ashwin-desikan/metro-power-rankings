import "server-only";
import fs from "fs";
import path from "path";

export type Mayor = {
  city: string;
  country: string;
  mayor: string;
  title: string;
  since: string;
  second?: { name: string; role: string };
};

const GH_RAW = "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/mayors.json";

async function load(): Promise<Record<string, Mayor>> {
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (res.ok) return (await res.json()) as Record<string, Mayor>;
  } catch {
    /* fall through */
  }
  try {
    const file = path.join(process.cwd(), "public", "data", "mayors.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

/** Mayor of a metro's primary city, or null if not yet covered. */
export async function getMayor(metroSlug: string): Promise<Mayor | null> {
  return (await load())[metroSlug] ?? null;
}
export async function getAllMayors(): Promise<Record<string, Mayor>> {
  return load();
}
