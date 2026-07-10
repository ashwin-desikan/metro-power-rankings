// Phase 0: upsert the resolved slug -> QID map into public.country_facts.
// Runs host-side (needs SUPABASE_SERVICE_KEY, which bypasses RLS). Uses the
// same PostgREST upsert path the Phase 1 Wikidata builder will use.
//
//   node scripts/countryfacts/seed-supabase.mjs

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co";

// Minimal .env.local parser (KEY=VALUE lines).
function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, ".env.local"), "utf-8");
    const env = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error("No SUPABASE_SERVICE_KEY found in env or .env.local");
  process.exit(1);
}

const qids = JSON.parse(readFileSync(join(ROOT, "scripts", "countryfacts", "country-qids.json"), "utf-8"));
const rows = Object.entries(qids).map(([slug, r]) => ({
  slug,
  qid: r.qid,
  iso2: r.iso2 || null,
  iso3: r.iso3 || null,
}));

console.log(`Upserting ${rows.length} rows into country_facts...`);

const res = await fetch(`${SUPABASE_URL}/rest/v1/country_facts?on_conflict=slug`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!res.ok) {
  console.error("Upsert failed:", res.status, await res.text());
  process.exit(1);
}
console.log("Upsert OK:", res.status);
