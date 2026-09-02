// Phase 0 of the country-facts feature: resolve every /countries slug to a
// Wikidata QID. Runs host-side (sandbox egress can't reach Wikidata).
//
//   node scripts/countryfacts/resolve-qids.mjs
//
// Strategy:
//   - 200 slugs carry an ISO code (from country-indicators.json) -> resolve
//     authoritatively via Wikidata P298 (alpha-3) / P297 (alpha-2).
//   - The 47 without ISO (UK home nations, dependencies, a few sovereigns the
//     World Bank join missed) -> a curated SEED map for the ambiguous ones,
//     name-search for the rest. Every non-ISO pick is verified by fetching its
//     Wikidata label + description back, so we can eyeball the tail.
//
// Output: scripts/countryfacts/country-qids.json  +  a console coverage report.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const UA = "citizenofnowhere-countryfacts/0.1 (https://citizenofnowhere.org; ashwind@gmail.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const countries = JSON.parse(readFileSync(join(ROOT, "public", "data", "countries.json"), "utf-8"));
const ind = JSON.parse(readFileSync(join(ROOT, "public", "data", "country-indicators.json"), "utf-8")).countries || {};

// Curated QIDs for the tail entities that are ambiguous by name (Congo,
// Taiwan, the partially-recognised states) or where the site's label differs
// from Wikidata's (Tahiti = French Polynesia). Everything else in the no-ISO
// set is resolved by name-search and printed for review.
const SEED = {
  england: "Q21", scotland: "Q22", wales: "Q25", "northern-ireland": "Q26",
  taiwan: "Q865", congo: "Q971", "western-sahara": "Q6250",
  "northern-cyprus": "Q23681", abkhazia: "Q23334", "south-ossetia": "Q23427",
  transnistria: "Q907112", "vatican-city": "Q237",
  tahiti: "Q30971", // French Polynesia — site labels it "Tahiti"; CONFIRM
  // Corrections for name-search false positives (verified via labels):
  saba: "Q25528", // Saba (Caribbean, NL) — search returned Sabah, Malaysia
  "saint-barthelemy": "Q25362", // search returned a commune in Morbihan
  "saint-martin": "Q126125", // French collectivity — search returned a Jersey parish
  "turks-caicos-islands": "Q18221", // search returned an athletics association
};

async function fetchJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error("http " + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(1000 * i);
    }
  }
}

async function sparqlByProp(prop) {
  const q = `SELECT ?item ?code WHERE { ?item wdt:${prop} ?code }`;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  const j = await fetchJson(url);
  const map = {};
  for (const b of j.results.bindings) {
    const qid = b.item.value.split("/").pop();
    if (!(b.code.value in map)) map[b.code.value] = qid;
  }
  return map;
}

async function searchEntity(name) {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=6&search=" +
    encodeURIComponent(name);
  const j = await fetchJson(url);
  const cands = j.search || [];
  const good = cands.find((c) =>
    /countr|state|territor|island|depend|nation|republic|collectivit|autonom|region|constituent|overseas/i.test(c.description || "")
  );
  const pick = good || cands[0];
  return pick ? { qid: pick.id, label: pick.label, description: pick.description || "" } : null;
}

async function labelsFor(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|descriptions&languages=en|mul&ids=" +
      batch.join("|");
    const j = await fetchJson(url);
    for (const [qid, ent] of Object.entries(j.entities || {})) {
      out[qid] = {
        // `mul` fallback: Wikidata is migrating labels to the language-agnostic
          // code and deleting the redundant `en` one, so an en-only read returns
          // "" for a growing set of entities. Descriptions are not migrated the
          // same way, so they stay en-only.
          label: ent.labels?.en?.value || ent.labels?.mul?.value || "",
        description: ent.descriptions?.en?.value || "",
      };
    }
    await sleep(150);
  }
  return out;
}

const P297 = await sparqlByProp("P297");
const P298 = await sparqlByProp("P298");
console.log(`Wikidata ISO maps: alpha-2 ${Object.keys(P297).length}, alpha-3 ${Object.keys(P298).length}`);

const out = {};
const report = { total: countries.length, byIso: 0, bySeed: 0, bySearch: 0, unresolved: [], tail: [] };

for (const c of countries) {
  const i = ind[c.slug] || {};
  const iso2 = i.iso2 || null;
  const iso3 = i.iso3 || null;
  let rec = null;
  if (iso3 && P298[iso3]) rec = { qid: P298[iso3], method: "iso3", iso2, iso3 };
  else if (iso2 && P297[iso2]) rec = { qid: P297[iso2], method: "iso2", iso2, iso3 };
  else if (SEED[c.slug]) rec = { qid: SEED[c.slug], method: "seed", iso2, iso3 };

  if (rec) {
    if (rec.method === "seed") report.bySeed++;
    else report.byIso++;
    out[c.slug] = rec;
  } else {
    await sleep(200);
    let s = null;
    try { s = await searchEntity(c.name); } catch (e) { console.log("search err", c.slug, e.message); }
    if (s) {
      out[c.slug] = { qid: s.qid, method: "search", iso2, iso3 };
      report.bySearch++;
    } else {
      report.unresolved.push({ slug: c.slug, name: c.name });
    }
  }
}

// Verify the non-ISO tail (seed + search) by fetching labels back.
const tailSlugs = Object.entries(out).filter(([, r]) => r.method === "seed" || r.method === "search").map(([slug]) => slug);
const tailQids = [...new Set(tailSlugs.map((s) => out[s].qid))];
const labels = await labelsFor(tailQids);
for (const slug of tailSlugs) {
  const r = out[slug];
  report.tail.push({ slug, name: countries.find((c) => c.slug === slug)?.name, qid: r.qid, method: r.method, wd: labels[r.qid] || {} });
}

mkdirSync(join(ROOT, "scripts", "countryfacts"), { recursive: true });
writeFileSync(join(ROOT, "scripts", "countryfacts", "country-qids.json"), JSON.stringify(out, null, 2));

console.log("\n=== COVERAGE ===");
console.log(`total ${report.total} | ISO ${report.byIso} | seed ${report.bySeed} | search ${report.bySearch} | UNRESOLVED ${report.unresolved.length}`);
console.log("\n=== NON-ISO TAIL (verify these) ===");
for (const t of report.tail.sort((a, b) => a.method.localeCompare(b.method) || a.slug.localeCompare(b.slug))) {
  console.log(`${t.slug.padEnd(40)} ${t.qid.padEnd(11)} [${t.method}]  ${t.wd.label || "?"} — ${t.wd.description || ""}`);
}
if (report.unresolved.length) {
  console.log("\n=== UNRESOLVED ===");
  for (const u of report.unresolved) console.log(u.slug, "|", u.name);
}
console.log("\nWrote scripts/countryfacts/country-qids.json");
