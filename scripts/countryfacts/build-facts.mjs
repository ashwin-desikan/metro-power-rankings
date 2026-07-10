// Phase 1 of the country-facts feature: fetch the ~11 infobox fields from
// Wikidata for every resolved QID and upsert them into public.country_facts.
// Runs host-side (needs Wikidata egress + SUPABASE_SERVICE_KEY).
//
//   node scripts/countryfacts/build-facts.mjs [--dry-run]
//
// Fields (Wikidata property -> column):
//   P37  official language      -> official_languages[]
//   P38  currency               -> currency_name, currency_iso (P498), currency_symbol (ISO map)
//   P421 located in time zone   -> timezones[]
//   P1622 driving side          -> driving_side ('left' | 'right')
//   P474 country calling code   -> calling_code
//   P78  top-level internet dom -> tld[]
//   P122 basic form of govt     -> government_form
//   P1549 demonym               -> demonym
//   P571 inception              -> formation_date (year)
//   P297 ISO 3166-1 alpha-2     -> iso_3166 (falls back to Phase-0 iso2)
//   P610 highest point + P2044  -> highest_point_name, highest_point_m
//
// Manual overrides (country_facts.overrides jsonb) always win over Wikidata.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co";
const UA = "citizenofnowhere-countryfacts/0.1 (https://citizenofnowhere.org; ashwind@gmail.com)";
const DRY = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, ".env.local"), "utf-8");
    const env = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch { return {}; }
}
const env = loadEnv();
const KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY;
if (!KEY && !DRY) { console.error("No SUPABASE_SERVICE_KEY"); process.exit(1); }

const CUR_SYMBOL = {
  EUR: "€", USD: "$", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", RUB: "₽", CHF: "CHF",
  AUD: "$", CAD: "$", KRW: "₩", BRL: "R$", ZAR: "R", TRY: "₺", MXN: "$", SEK: "kr",
  NOK: "kr", DKK: "kr", PLN: "zł", THB: "฿", IDR: "Rp", SAR: "﷼", AED: "د.إ",
  ILS: "₪", SGD: "$", HKD: "$", NZD: "$", PHP: "₱", VND: "₫", NGN: "₦", EGP: "£",
  PKR: "₨", BDT: "৳", VES: "Bs.", ARS: "$", CLP: "$", COP: "$", MYR: "RM", CZK: "Kč",
  HUF: "Ft", RON: "lei", UAH: "₴", KWD: "د.ك", QAR: "﷼", BHD: ".د.ب", OMR: "﷼",
};

// When an entity lists several concurrent currencies (e.g. the Kingdom of the
// Netherlands: euro + US dollar + Caribbean guilder), prefer the primary one.
const CURRENCY_PRIORITY = ["EUR", "USD", "GBP", "CHF", "JPY", "CNY", "AUD", "CAD", "NZD"];

// Convert an IANA tz-database id (Europe/London) to a standard-time UTC offset
// string (UTC+00:00). Used only when an entity's P421 has no cleaner named
// zone / offset value. January date -> standard (non-DST) offset.
function tzOffset(id) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "longOffset" })
      .formatToParts(new Date(Date.UTC(2025, 0, 15)));
    const tzn = parts.find((p) => p.type === "timeZoneName")?.value || "";
    let off = tzn.replace("GMT", "").trim();
    if (!off) return "UTC+00:00";
    const m = off.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) return null;
    return `UTC${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  } catch { return null; }
}

const qids = JSON.parse(readFileSync(join(ROOT, "scripts", "countryfacts", "country-qids.json"), "utf-8"));
const slugByQid = {};
for (const [slug, r] of Object.entries(qids)) slugByQid[r.qid] = slug;
const allQids = [...new Set(Object.values(qids).map((r) => r.qid))];

async function fetchJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
      if (!res.ok) throw new Error("http " + res.status);
      return await res.json();
    } catch (e) { if (i === tries) throw e; await sleep(1500 * i); }
  }
}
const V = (b, k) => (b[k] ? b[k].value : null);
const qidOf = (b, k) => (b[k] ? b[k].value.split("/").pop() : null);
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

async function runMain(qidChunk) {
  const values = qidChunk.map((q) => "wd:" + q).join(" ");
  const q = `SELECT ?item
      (GROUP_CONCAT(DISTINCT ?langL; separator="|") AS ?langs)
      (SAMPLE(?curL) AS ?curName) (SAMPLE(?curCode) AS ?curIso)
      (GROUP_CONCAT(DISTINCT ?tzL; separator="|") AS ?tzs)
      (SAMPLE(?driveL) AS ?drive)
      (GROUP_CONCAT(DISTINCT ?call; separator="|") AS ?calls)
      (GROUP_CONCAT(DISTINCT ?tldL; separator="|") AS ?tlds)
      (SAMPLE(?govL) AS ?gov)
      (SAMPLE(?dem) AS ?demonym)
      (SAMPLE(?inc) AS ?inception)
      (SAMPLE(?iso) AS ?iso3166)
      (SAMPLE(?anthemL) AS ?anthem)
      (SAMPLE(?motto) AS ?mottoT)
      (SAMPLE(?legL) AS ?legislature)
    WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P37 ?lang. ?lang rdfs:label ?langL. FILTER(lang(?langL)="en") }
      OPTIONAL { ?item wdt:P38 ?cur. ?cur rdfs:label ?curL. FILTER(lang(?curL)="en") OPTIONAL { ?cur wdt:P498 ?curCode } }
      OPTIONAL { ?item wdt:P421 ?tz. ?tz rdfs:label ?tzL. FILTER(lang(?tzL)="en") }
      OPTIONAL { ?item wdt:P1622 ?drv. ?drv rdfs:label ?driveL. FILTER(lang(?driveL)="en") }
      OPTIONAL { ?item wdt:P474 ?call }
      OPTIONAL { ?item wdt:P78 ?tld. ?tld rdfs:label ?tldL. FILTER(lang(?tldL)="en") }
      OPTIONAL { ?item wdt:P122 ?g. ?g rdfs:label ?govL. FILTER(lang(?govL)="en") }
      OPTIONAL { ?item wdt:P1549 ?dem. FILTER(lang(?dem)="en") }
      OPTIONAL { ?item wdt:P571 ?inc }
      OPTIONAL { ?item wdt:P297 ?iso }
      OPTIONAL { ?item wdt:P85 ?an. ?an rdfs:label ?anthemL. FILTER(lang(?anthemL)="en") }
      OPTIONAL { ?item wdt:P1451 ?motto }
      OPTIONAL { ?item wdt:P194 ?leg. ?leg rdfs:label ?legL. FILTER(lang(?legL)="en") }
    } GROUP BY ?item`;
  const j = await fetchJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
  return j.results.bindings;
}

async function runCurrency(qidChunk) {
  const values = qidChunk.map((q) => "wd:" + q).join(" ");
  const q = `SELECT ?item ?curL ?curCode ?rank (EXISTS { ?st pq:P582 ?e } AS ?hasEnd) WHERE {
      VALUES ?item { ${values} }
      ?item p:P38 ?st. ?st ps:P38 ?cur. ?st wikibase:rank ?rank.
      ?cur rdfs:label ?curL. FILTER(lang(?curL)="en")
      OPTIONAL { ?cur wdt:P498 ?curCode }
    }`;
  const j = await fetchJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
  return j.results.bindings;
}

async function runPeaks(qidChunk) {
  const values = qidChunk.map((q) => "wd:" + q).join(" ");
  const q = `SELECT ?item ?hpL ?elev WHERE {
      VALUES ?item { ${values} }
      ?item wdt:P610 ?hp. ?hp rdfs:label ?hpL. FILTER(lang(?hpL)="en")
      OPTIONAL { ?hp wdt:P2044 ?elev }
    }`;
  const j = await fetchJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
  return j.results.bindings;
}

const facts = {}; // qid -> row
for (const c of chunk(allQids, 45)) {
  const rows = await runMain(c);
  for (const b of rows) {
    const qid = qidOf(b, "item");
    const split = (s) => (V(b, s) ? V(b, s).split("|").filter(Boolean) : []);
    const iso = V(b, "curIso");
    const drive = (V(b, "drive") || "").toLowerCase();
    const inc = V(b, "inception");
    facts[qid] = {
      official_languages: split("langs"),
      currency_name: V(b, "curName"),
      currency_iso: iso,
      currency_symbol: iso && CUR_SYMBOL[iso] ? CUR_SYMBOL[iso] : null,
      timezones: (() => {
        const t = split("tzs");
        const clean = t.filter((x) => !x.includes("/")); // prefer named zones / offsets over tz-db ids
        if (clean.length) return [...new Set(clean)].sort();
        const offs = [...new Set(t.map(tzOffset).filter(Boolean))].sort();
        return offs.length ? offs : null;
      })(),
      driving_side: drive.includes("left") ? "left" : drive.includes("right") ? "right" : null,
      calling_code: split("calls").join(", ") || null,
      tld: split("tlds"),
      government_form: V(b, "gov"),
      demonym: V(b, "demonym"),
      formation_date: inc ? String(new Date(inc).getUTCFullYear()) : null,
      iso_3166: V(b, "iso3166"),
      anthem: V(b, "anthem"),
      motto: V(b, "mottoT"),
      legislature: V(b, "legislature"),
    };
  }
  await sleep(400);
}
for (const c of chunk(allQids, 60)) {
  const rows = await runPeaks(c);
  for (const b of rows) {
    const qid = qidOf(b, "item");
    if (!facts[qid]) continue;
    const elev = V(b, "elev") ? Math.round(Number(V(b, "elev"))) : null;
    const name = V(b, "hpL");
    // keep the highest if multiple peaks come back
    if (!facts[qid].highest_point_name || (elev && (facts[qid].highest_point_m ?? -1) < elev)) {
      facts[qid].highest_point_name = name;
      facts[qid].highest_point_m = elev;
    }
  }
  await sleep(400);
}

// Currency: pick a primary among concurrent currencies (skip ended ones,
// prefer preferred-rank, then the priority list), overriding the main query.
const curByQid = {};
for (const c of chunk(allQids, 60)) {
  const rows = await runCurrency(c);
  for (const b of rows) {
    const qid = qidOf(b, "item");
    (curByQid[qid] ||= []).push({
      name: V(b, "curL"),
      code: V(b, "curCode"),
      rank: V(b, "rank") || "",
      ended: V(b, "hasEnd") === "true" || V(b, "hasEnd") === "1",
    });
  }
  await sleep(400);
}
for (const [qid, list] of Object.entries(curByQid)) {
  if (!facts[qid]) continue;
  let cands = list.filter((c) => !c.ended);
  if (!cands.length) cands = list;
  const preferred = cands.filter((c) => c.rank.endsWith("PreferredRank"));
  if (preferred.length) cands = preferred;
  const pri = (c) => { const i = CURRENCY_PRIORITY.indexOf(c.code); return i < 0 ? 999 : i; };
  cands.sort((a, b) => pri(a) - pri(b) || (a.name || "").localeCompare(b.name || ""));
  const pick = cands[0];
  if (pick) {
    facts[qid].currency_name = pick.name;
    facts[qid].currency_iso = pick.code || null;
    facts[qid].currency_symbol = pick.code && CUR_SYMBOL[pick.code] ? CUR_SYMBOL[pick.code] : null;
  }
}

// Fetch existing manual overrides so they win over Wikidata.
let overridesBySlug = {};
if (KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/country_facts?select=slug,overrides&overrides=neq.%7B%7D`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (res.ok) for (const r of await res.json()) overridesBySlug[r.slug] = r.overrides || {};
}

const rows = [];
for (const [slug, meta] of Object.entries(qids)) {
  const f = facts[meta.qid] || {};
  const row = {
    slug,
    official_languages: f.official_languages && f.official_languages.length ? f.official_languages : null,
    currency_name: f.currency_name ?? null,
    currency_symbol: f.currency_symbol ?? null,
    currency_iso: f.currency_iso ?? null,
    timezones: f.timezones && f.timezones.length ? f.timezones : null,
    driving_side: f.driving_side ?? null,
    calling_code: f.calling_code ?? null,
    tld: f.tld && f.tld.length ? f.tld : null,
    iso_3166: meta.iso2 || f.iso_3166 || null,
    government_form: f.government_form ?? null,
    demonym: f.demonym ?? null,
    formation_date: f.formation_date ?? null,
    highest_point_name: f.highest_point_name ?? null,
    highest_point_m: f.highest_point_m ?? null,
    anthem: f.anthem ?? null,
    motto: f.motto ?? null,
    legislature: f.legislature ?? null,
    source: "wikidata",
    updated_at: new Date().toISOString(),
  };
  const ov = overridesBySlug[slug];
  if (ov) for (const [k, v] of Object.entries(ov)) row[k] = v;
  rows.push(row);
}

// Coverage report
const cols = ["official_languages", "currency_name", "currency_iso", "timezones", "driving_side",
  "calling_code", "tld", "iso_3166", "government_form", "legislature", "demonym", "formation_date", "highest_point_name", "anthem", "motto"];
console.log(`\n=== FIELD FILL (of ${rows.length}) ===`);
for (const col of cols) {
  const n = rows.filter((r) => r[col] != null && (!Array.isArray(r[col]) || r[col].length)).length;
  console.log(col.padEnd(20), n, "  " + Math.round((100 * n) / rows.length) + "%");
}
const empty = rows.filter((r) => cols.every((col) => r[col] == null || (Array.isArray(r[col]) && !r[col].length)));
console.log(`\nrows with ZERO facts: ${empty.length}` + (empty.length ? " -> " + empty.map((r) => r.slug).join(", ") : ""));
const nl = rows.find((r) => r.slug === "netherlands");
console.log("\nNetherlands sample:", JSON.stringify(nl, null, 1));

if (DRY) { console.log("\n[dry-run] not writing to Supabase or JSON"); process.exit(0); }

// Write the committed read snapshot the country page consumes (camelCase,
// mirrors public/data/country-indicators.json). Supabase stays the editable
// system of record; this JSON is the build-time read path.
const factsJson = { countries: {} };
for (const r of rows) {
  factsJson.countries[r.slug] = {
    qid: qids[r.slug]?.qid || null,
    officialLanguages: r.official_languages,
    currencyName: r.currency_name,
    currencySymbol: r.currency_symbol,
    currencyIso: r.currency_iso,
    timezones: r.timezones,
    drivingSide: r.driving_side,
    callingCode: r.calling_code,
    tld: r.tld,
    iso3166: r.iso_3166,
    governmentForm: r.government_form,
    demonym: r.demonym,
    formationDate: r.formation_date,
    highestPointName: r.highest_point_name,
    highestPointM: r.highest_point_m,
    anthem: r.anthem,
    motto: r.motto,
    legislature: r.legislature,
  };
}
writeFileSync(join(ROOT, "public", "data", "country-facts.json"), JSON.stringify(factsJson));
console.log("Wrote public/data/country-facts.json");

// Upsert in batches
let ok = 0;
for (const c of chunk(rows, 100)) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/country_facts?on_conflict=slug`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(c),
  });
  if (!res.ok) { console.error("upsert failed", res.status, await res.text()); process.exit(1); }
  ok += c.length;
}
console.log(`\nUpserted ${ok} rows into country_facts.`);
