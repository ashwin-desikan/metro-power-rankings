"use client";

// Audience Builder. Compose AND-joined rules over dimension percentiles,
// attributes, categoricals, and synthetic fan-level scores; describe a segment
// in plain English; size it live; read its distinctive signature; expand with
// lookalikes; preview the consent gate; then save, share, or activate. Metros
// are the stand-in first-party audience; consent and scores are synthetic.

import { useEffect, useMemo, useState } from "react";
import { DataBar } from "@/app/_shared/DataBar";
import ActivationModal, { type ActProfile } from "./ActivationModal";

type Consent = "opted_in" | "opted_out" | "unknown";
type Profile = {
  slug: string; name: string; country: string; region: string; continent: string;
  capital: boolean;
  attrs: {
    rank: number | null; pop: number | null; gdpPerCapita: number | null;
    majorTeams: number | null; companies: number | null; skyscrapers: number | null;
    marketCap: number | null;
  };
  dims: Record<string, number>;
  governance: { consent: Consent; suppressed: boolean };
};

type ValueTier = "High" | "Mid" | "Low";
type Scores = { propensity: number; churn: number; valueTier: ValueTier };

type AttrField = "rank" | "pop" | "gdpPerCapita" | "majorTeams" | "companies" | "skyscrapers" | "marketCap";
type Rule =
  | { id: number; kind: "dim"; dim: string; pct: number }
  | { id: number; kind: "attr"; field: AttrField; op: ">=" | "<="; value: number }
  | { id: number; kind: "cat"; field: "region" | "continent"; values: string[] }
  | { id: number; kind: "capital" }
  | { id: number; kind: "score"; metric: "propensity" | "churn"; op: ">=" | "<="; value: number }
  | { id: number; kind: "value"; tiers: ValueTier[] };

type SavedSegment = { name: string; rules: Rule[]; lookalikeN: number };

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#4ECDC4";
const GOLD = "#d4af37";
const SEG_KEY = "studio-audience-segments";
// The propensity bar's ceiling. scoresFor() clamps the score to 1..99, so the
// scale has its own fixed maximum and that is what every row is drawn against.
// Deliberately NOT the maximum of the rows on screen: the table shows the first
// 14 of the segment, and scaling a bounded score to a slice would draw a member
// on 70 as if it were the weakest thing in the audience. One max for every row,
// as everywhere else, but here the column's own ceiling supplies it.
const PROPENSITY_MAX = 100;
const LOOKALIKE_STEPS = [0, 50, 100, 250, 500];
const SCORE_METRICS: { key: "propensity" | "churn"; label: string }[] = [
  { key: "propensity", label: "Propensity" },
  { key: "churn", label: "Churn risk" },
];
const VALUE_TIERS: ValueTier[] = ["High", "Mid", "Low"];

const DIMENSIONS: { key: string; label: string; group: string }[] = [
  { key: "majorLeagueTeams", label: "Major League Teams", group: "Sports" },
  { key: "totalTeams", label: "Total Teams", group: "Sports" },
  { key: "majorSportingEvents", label: "Major Sporting Events", group: "Sports" },
  { key: "companies", label: "Major Companies", group: "Economy" },
  { key: "marketCap", label: "Market Capitalization", group: "Economy" },
  { key: "portsExchangesInfra", label: "Ports, Exchanges & Infrastructure", group: "Economy" },
  { key: "culturalEvents", label: "Cultural Events", group: "Culture & Education" },
  { key: "universities", label: "Universities", group: "Culture & Education" },
  { key: "topUniHospResearch", label: "Top Universities, Hospitals & Research", group: "Culture & Education" },
  { key: "museumsLandmarks", label: "Museums & Landmarks", group: "Culture & Education" },
  { key: "luxuryStars", label: "Luxury & Fine Dining", group: "Culture & Education" },
  { key: "airportScore", label: "Airport Connectivity", group: "Connectivity" },
  { key: "metroStations", label: "Metro Stations", group: "Connectivity" },
  { key: "suburbStations", label: "Suburban Stations", group: "Connectivity" },
  { key: "trainHubs", label: "Rail Hubs", group: "Connectivity" },
  { key: "skyscrapers", label: "Skyscrapers", group: "Connectivity" },
];
const DIM_LABEL: Record<string, string> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label]));
const DIM_GROUPS = ["Sports", "Economy", "Culture & Education", "Connectivity"];
const DIM_KEYS = DIMENSIONS.map((d) => d.key);

const ATTRS: { field: AttrField; label: string; defaultOp: ">=" | "<="; defaultValue: number }[] = [
  { field: "rank", label: "Overall rank", defaultOp: "<=", defaultValue: 500 },
  { field: "pop", label: "Population", defaultOp: ">=", defaultValue: 1000000 },
  { field: "gdpPerCapita", label: "GDP per capita (USD)", defaultOp: ">=", defaultValue: 40000 },
  { field: "majorTeams", label: "Major league teams", defaultOp: ">=", defaultValue: 2 },
  { field: "companies", label: "Major companies", defaultOp: ">=", defaultValue: 10 },
  { field: "skyscrapers", label: "Skyscrapers", defaultOp: ">=", defaultValue: 20 },
  { field: "marketCap", label: "Market cap (USD)", defaultOp: ">=", defaultValue: 100000000000 },
];
const ATTR_LABEL: Record<AttrField, string> = Object.fromEntries(
  ATTRS.map((a) => [a.field, a.label]),
) as Record<AttrField, string>;

function fmt(field: AttrField, v: number): string {
  if (field === "marketCap") {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
    return `$${(v / 1e6).toFixed(0)}M`;
  }
  if (field === "gdpPerCapita") return `$${v.toLocaleString()}`;
  return v.toLocaleString();
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function hashSlug(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// SYNTHETIC fan-level scores, derived deterministically from a metro's profile
// so they are stable and explainable: propensity leans on engagement-like
// dimensions, value tier on the economic ones, churn is the inverse of
// propensity. A per-slug jitter spreads them. Labeled synthetic in the UI.
function scoresFor(p: Profile): Scores {
  const d = p.dims;
  const eng = (d.culturalEvents ?? 0) * 0.35 + (d.majorSportingEvents ?? 0) * 0.35 + (d.majorLeagueTeams ?? 0) * 0.3;
  const j1 = (hashSlug(p.slug) % 25) - 12;
  const propensity = clamp(Math.round(eng * 0.75 + 15 + j1), 1, 99);
  const econ = (d.marketCap ?? 0) * 0.5 + (d.companies ?? 0) * 0.5;
  const valueTier: ValueTier = econ >= 78 ? "High" : econ >= 48 ? "Mid" : "Low";
  const j2 = (hashSlug(p.slug + "c") % 25) - 12;
  const churn = clamp(Math.round(100 - propensity * 0.65 + j2), 1, 99);
  return { propensity, churn, valueTier };
}

function matches(p: Profile, r: Rule, sc: Scores): boolean {
  if (r.kind === "dim") return (p.dims[r.dim] ?? 0) >= r.pct;
  if (r.kind === "capital") return p.capital;
  if (r.kind === "cat") return r.values.length === 0 || r.values.includes(p[r.field]);
  if (r.kind === "score") {
    const v = r.metric === "propensity" ? sc.propensity : sc.churn;
    return r.op === ">=" ? v >= r.value : v <= r.value;
  }
  if (r.kind === "value") return r.tiers.length === 0 || r.tiers.includes(sc.valueTier);
  const v = p.attrs[r.field];
  if (v == null) return false;
  return r.op === ">=" ? v >= r.value : v <= r.value;
}

function centroid(ms: Profile[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const k of DIM_KEYS) {
    let s = 0;
    for (const p of ms) s += p.dims[k] ?? 0;
    c[k] = ms.length ? s / ms.length : 0;
  }
  return c;
}
function distance(p: Profile, c: Record<string, number>): number {
  let s = 0;
  for (const k of DIM_KEYS) { const d = (p.dims[k] ?? 0) - c[k]; s += d * d; }
  return Math.sqrt(s);
}

function encodeSeg(rules: Rule[], lookalikeN: number): string {
  try { return btoa(encodeURIComponent(JSON.stringify({ r: rules, l: lookalikeN }))); } catch { return ""; }
}
function decodeSeg(s: string): { rules: Rule[]; lookalikeN: number } | null {
  try {
    const o = JSON.parse(decodeURIComponent(atob(s)));
    if (!Array.isArray(o.r)) return null;
    return { rules: o.r as Rule[], lookalikeN: Number(o.l) || 0 };
  } catch { return null; }
}

let _id = 100;
const nextId = () => ++_id;

// Parse a plain-English brief into builder rules. Deterministic keyword
// mapping, grounded in the same dimensions and attributes the UI exposes, so
// the result is always an editable, governed segment rather than a black box.
function parseNL(text: string, regions: string[], continents: string[]): { rules: Rule[]; lookalikeN: number; hits: string[] } {
  const t = ` ${text.toLowerCase()} `;
  const rules: Rule[] = [];
  const hits: string[] = [];
  let lookalikeN = 0;

  const topM = t.match(/top\s+(\d+)/);
  if (topM) { rules.push({ id: nextId(), kind: "attr", field: "rank", op: "<=", value: Number(topM[1]) }); hits.push(`top ${topM[1]} by rank`); }

  const dimKw: [RegExp, string][] = [
    [/cultur|arts|music|festival/, "culturalEvents"],
    [/sport|matchday|stadium/, "majorSportingEvents"],
    [/\bteams?\b|franchise/, "majorLeagueTeams"],
    [/universit|academ|college|student/, "universities"],
    [/financ|market|econom|wealth|business/, "marketCap"],
    [/transit|rail|metro|airport|connect/, "airportScore"],
    [/museum|landmark|herit/, "museumsLandmarks"],
    [/luxur|fine.?dining|michelin/, "luxuryStars"],
  ];
  for (const [re, key] of dimKw) {
    if (re.test(t) && !rules.some((r) => r.kind === "dim" && r.dim === key)) {
      rules.push({ id: nextId(), kind: "dim", dim: key, pct: 75 });
      hits.push(`high ${DIM_LABEL[key]}`);
    }
  }

  const contHit = continents.filter((c) => t.includes(` ${c.toLowerCase()} `) || t.includes(c.toLowerCase()));
  if (contHit.length) { rules.push({ id: nextId(), kind: "cat", field: "continent", values: contHit }); hits.push(contHit.join(", ")); }
  const regHit = regions.filter((r) => r.length > 3 && t.includes(r.toLowerCase()));
  if (regHit.length) { rules.push({ id: nextId(), kind: "cat", field: "region", values: regHit }); hits.push(regHit.join(", ")); }

  if (/capital/.test(t)) { rules.push({ id: nextId(), kind: "capital" }); hits.push("capital metros"); }

  if (/churn|laps|at.?risk|about to lose|lapsing|win.?back/.test(t)) { rules.push({ id: nextId(), kind: "score", metric: "churn", op: ">=", value: 60 }); hits.push("high churn risk"); }
  if (/loyal|renew|engaged|high.?propensity|likely/.test(t)) { rules.push({ id: nextId(), kind: "score", metric: "propensity", op: ">=", value: 70 }); hits.push("high propensity"); }
  if (/high.?value|premium|vip|big.?spend/.test(t)) { rules.push({ id: nextId(), kind: "value", tiers: ["High"] }); hits.push("high value tier"); }

  if (/lookalike|similar to|like our|like my|seed/.test(t)) { lookalikeN = 100; hits.push("expand with lookalikes"); }

  return { rules, lookalikeN, hits };
}

export default function AudienceBuilder({ total: totalProp }: { total: number }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/data/audience/profiles.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Profile[]) => { setProfiles(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const [rules, setRules] = useState<Rule[]>([
    { id: 1, kind: "dim", dim: "culturalEvents", pct: 75 },
    { id: 2, kind: "attr", field: "rank", op: "<=", value: 500 },
  ]);
  const [lookalikeN, setLookalikeN] = useState(0);
  const [dimToAdd, setDimToAdd] = useState("");
  const [attrToAdd, setAttrToAdd] = useState("");
  const [scoreToAdd, setScoreToAdd] = useState("");
  const [saved, setSaved] = useState<SavedSegment[]>([]);
  const [segName, setSegName] = useState("");
  const [showActivate, setShowActivate] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [nlText, setNlText] = useState("");
  const [nlHits, setNlHits] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const seg = new URL(window.location.href).searchParams.get("seg");
      if (seg) { const d = decodeSeg(seg); if (d) { setRules(d.rules); setLookalikeN(d.lookalikeN); } }
      const raw = window.localStorage.getItem(SEG_KEY);
      if (raw) setSaved(JSON.parse(raw) as SavedSegment[]);
    } catch { /* ignore */ }
  }, []);

  function persist(next: SavedSegment[]) {
    setSaved(next);
    try { window.localStorage.setItem(SEG_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const scoreOf = useMemo(() => {
    const m = new Map<string, Scores>();
    for (const p of profiles) m.set(p.slug, scoresFor(p));
    return m;
  }, [profiles]);

  // Universe mean per dimension, for the distinctive-signature panel.
  const universeMean = useMemo(() => {
    const c: Record<string, number> = {};
    for (const k of DIM_KEYS) {
      let s = 0;
      for (const p of profiles) s += p.dims[k] ?? 0;
      c[k] = profiles.length ? s / profiles.length : 0;
    }
    return c;
  }, [profiles]);

  const regions = useMemo(() => Array.from(new Set(profiles.map((p) => p.region))).sort(), [profiles]);
  const continents = useMemo(() => Array.from(new Set(profiles.map((p) => p.continent))).sort(), [profiles]);

  const members = useMemo(
    () => profiles.filter((p) => { const sc = scoreOf.get(p.slug)!; return rules.every((r) => matches(p, r, sc)); }),
    [profiles, rules, scoreOf],
  );

  const lookalikes = useMemo(() => {
    if (lookalikeN <= 0 || members.length === 0 || members.length >= profiles.length) return [];
    const seed = new Set(members.map((p) => p.slug));
    const c = centroid(members);
    return profiles
      .filter((p) => !seed.has(p.slug))
      .map((p) => ({ p, d: distance(p, c) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, lookalikeN)
      .map((x) => x.p);
  }, [profiles, members, lookalikeN]);

  const lookalikeSlugs = useMemo(() => new Set(lookalikes.map((p) => p.slug)), [lookalikes]);
  const effective = useMemo(() => [...members, ...lookalikes], [members, lookalikes]);

  const stats = useMemo(() => {
    let addressable = 0, optOut = 0, unknown = 0, suppressed = 0;
    const byRegion = new Map<string, number>();
    for (const p of effective) {
      byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + 1);
      if (p.governance.suppressed) suppressed++;
      else if (p.governance.consent === "opted_in") addressable++;
      else if (p.governance.consent === "opted_out") optOut++;
      else unknown++;
    }
    const region = Array.from(byRegion.entries()).sort((a, b) => b[1] - a[1]);
    return { addressable, optOut, unknown, suppressed, region };
  }, [effective]);

  // Distinctive signature: dimensions where the segment most over-indexes the
  // universe, in percentile points.
  const signature = useMemo(() => {
    if (effective.length === 0) return [];
    return DIM_KEYS
      .map((k) => {
        let s = 0;
        for (const p of effective) s += p.dims[k] ?? 0;
        return { key: k, delta: Math.round(s / effective.length - (universeMean[k] ?? 0)) };
      })
      .filter((x) => x.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [effective, universeMean]);

  const update = (id: number, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? ({ ...r, ...patch } as Rule) : r)));
  const remove = (id: number) => setRules((rs) => rs.filter((r) => r.id !== id));

  const total = totalProp || profiles.length;
  const pctOfTotal = total ? Math.round((effective.length / total) * 1000) / 10 : 0;
  const canLookalike = members.length > 0 && members.length < profiles.length;

  function runNL() {
    if (!nlText.trim()) return;
    const { rules: r, lookalikeN: l, hits } = parseNL(nlText, regions, continents);
    if (r.length || l) { setRules(r); setLookalikeN(l); }
    setNlHits(hits);
  }
  function saveSegment() {
    const name = segName.trim() || `Segment ${saved.length + 1}`;
    persist([{ name, rules, lookalikeN }, ...saved.filter((s) => s.name !== name)].slice(0, 20));
    setSegName(name);
  }
  function loadSegment(s: SavedSegment) { setRules(s.rules); setLookalikeN(s.lookalikeN); setSegName(s.name); }
  function deleteSegment(name: string) { persist(saved.filter((s) => s.name !== name)); }
  function copyShareLink() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("seg", encodeSeg(rules, lookalikeN));
      window.history.replaceState(null, "", u.toString());
      navigator.clipboard?.writeText(u.toString());
      setShareMsg("Link copied"); setTimeout(() => setShareMsg(""), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* ---------------- Builder ---------------- */}
      <section className="min-w-0 lg:col-span-3">
        {/* Natural-language query */}
        <div className="rounded-xl border p-3 mb-4" style={{ ...card, borderColor: ACCENT }}>
          <label className="text-xs font-semibold" style={{ color: ACCENT }}>Describe your audience</label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <input value={nlText} onChange={(e) => setNlText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runNL(); }}
              placeholder="e.g. high-value fans like our renewers in lapsed European markets"
              className="rounded-md border px-2.5 py-2 text-sm flex-1 min-w-[200px] bg-transparent" style={card} />
            <button type="button" onClick={runNL}
              className="rounded-md px-3 py-2 text-sm font-semibold" style={{ backgroundColor: ACCENT, color: "var(--bg)" }}>
              Build
            </button>
          </div>
          {nlHits && (
            <p className="text-[11px] text-[var(--text-dim)] mt-2">
              {nlHits.length
                ? <>Understood: {nlHits.join(" · ")}. Edit the rules below to refine.</>
                : <>No rules recognized. Try terms like top 100, cultural, European, high churn risk, lookalike.</>}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[var(--text-muted)]">Segment rules</h2>
          {(rules.length > 0 || lookalikeN > 0) && (
            <button type="button" onClick={() => { setRules([]); setLookalikeN(0); setNlHits(null); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] underline">
              Clear all
            </button>
          )}
        </div>

        {/* Save / share toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="Name this segment"
            className="rounded-md border px-2 py-1.5 flex-1 min-w-[140px] bg-transparent" style={card} />
          <button type="button" onClick={saveSegment} style={card}
            className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]">Save</button>
          <button type="button" onClick={copyShareLink} style={card}
            className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]">
            {shareMsg || "Copy share link"}
          </button>
        </div>

        {rules.length === 0 && (
          <p className="text-xs text-[var(--text-dim)] rounded-lg border px-3 py-3 mb-3" style={card}>
            No rules yet. Your audience is all {total.toLocaleString()} metros. Add a rule, or describe one above.
          </p>
        )}

        <div className="space-y-2 mb-4">
          {rules.map((r) => (
            <div key={r.id} className="rounded-lg border px-3 py-2.5 flex items-center gap-3" style={card}>
              <div className="flex-1 min-w-0">
                {r.kind === "dim" && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{DIM_LABEL[r.dim]} percentile</span>
                      <span className="tabular-nums" style={{ ...mono, color: ACCENT }}>{"≥"} {r.pct}</span>
                    </div>
                    <input type="range" min={0} max={100} value={r.pct} className="w-full accent-[var(--accent)]"
                      onChange={(e) => update(r.id, { pct: Number(e.target.value) })} />
                  </div>
                )}
                {r.kind === "score" && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{r.metric === "propensity" ? "Propensity" : "Churn risk"} score</span>
                      <span className="tabular-nums" style={{ ...mono, color: ACCENT }}>{r.op} {r.value}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={r.op} onChange={(e) => update(r.id, { op: e.target.value as ">=" | "<=" })}
                        className="rounded border px-1.5 py-1 bg-transparent text-xs" style={card}>
                        <option value=">=">{"≥"}</option>
                        <option value="<=">{"≤"}</option>
                      </select>
                      <input type="range" min={0} max={100} value={r.value} className="flex-1 accent-[var(--accent)]"
                        onChange={(e) => update(r.id, { value: Number(e.target.value) })} />
                    </div>
                  </div>
                )}
                {r.kind === "value" && (
                  <div>
                    <div className="text-xs font-medium mb-1.5">Value tier</div>
                    <div className="flex flex-wrap gap-1.5">
                      {VALUE_TIERS.map((v) => {
                        const on = r.tiers.includes(v);
                        return (
                          <button key={v} type="button"
                            onClick={() => update(r.id, { tiers: on ? r.tiers.filter((x) => x !== v) : [...r.tiers, v] })}
                            className="text-xs px-2 py-0.5 rounded-full border transition"
                            style={{ backgroundColor: on ? ACCENT : "transparent", color: on ? "var(--bg)" : "var(--text-muted)", borderColor: on ? ACCENT : "var(--border)" }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {r.kind === "attr" && (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-medium">{ATTR_LABEL[r.field]}</span>
                    <select value={r.op} onChange={(e) => update(r.id, { op: e.target.value as ">=" | "<=" })}
                      className="rounded border px-1.5 py-1 bg-transparent" style={card}>
                      <option value=">=">{"≥"}</option>
                      <option value="<=">{"≤"}</option>
                    </select>
                    <input type="number" value={r.value} style={{ ...mono, ...card }}
                      className="rounded border px-2 py-1 w-36 tabular-nums"
                      onChange={(e) => update(r.id, { value: Number(e.target.value) })} />
                    <span className="text-[var(--text-dim)]" style={mono}>{fmt(r.field, r.value)}</span>
                  </div>
                )}
                {r.kind === "cat" && (
                  <div>
                    <div className="text-xs font-medium mb-1.5 capitalize">{r.field}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(r.field === "region" ? regions : continents).map((v) => {
                        const on = r.values.includes(v);
                        return (
                          <button key={v} type="button"
                            onClick={() => update(r.id, { values: on ? r.values.filter((x) => x !== v) : [...r.values, v] })}
                            className="text-xs px-2 py-0.5 rounded-full border transition"
                            style={{ backgroundColor: on ? ACCENT : "transparent", color: on ? "var(--bg)" : "var(--text-muted)", borderColor: on ? ACCENT : "var(--border)" }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {r.kind === "capital" && (
                  <span className="text-xs font-medium">Capital metros only</span>
                )}
              </div>
              <button type="button" onClick={() => remove(r.id)} aria-label="Remove rule"
                className="text-[var(--text-dim)] hover:text-[var(--accent)] text-sm shrink-0">{"✕"}</button>
            </div>
          ))}
        </div>

        {/* Add controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={dimToAdd} style={card} className="rounded-md border px-2 py-1.5 bg-transparent"
            onChange={(e) => {
              const dim = e.target.value;
              if (dim) { setRules((rs) => [...rs, { id: nextId(), kind: "dim", dim, pct: 75 }]); setDimToAdd(""); }
            }}>
            <option value="">+ Dimension</option>
            {DIM_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {DIMENSIONS.filter((d) => d.group === g).map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <select value={attrToAdd} style={card} className="rounded-md border px-2 py-1.5 bg-transparent"
            onChange={(e) => {
              const f = e.target.value as AttrField;
              const meta = ATTRS.find((a) => a.field === f);
              if (meta) { setRules((rs) => [...rs, { id: nextId(), kind: "attr", field: meta.field, op: meta.defaultOp, value: meta.defaultValue }]); setAttrToAdd(""); }
            }}>
            <option value="">+ Attribute</option>
            {ATTRS.map((a) => <option key={a.field} value={a.field}>{a.label}</option>)}
          </select>

          <select value={scoreToAdd} style={card} className="rounded-md border px-2 py-1.5 bg-transparent"
            onChange={(e) => {
              const m = e.target.value as "propensity" | "churn";
              if (m) { setRules((rs) => [...rs, { id: nextId(), kind: "score", metric: m, op: ">=", value: m === "churn" ? 60 : 70 }]); setScoreToAdd(""); }
            }}>
            <option value="">+ Score</option>
            {SCORE_METRICS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <button type="button" style={card} className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]"
            disabled={rules.some((r) => r.kind === "value")}
            onClick={() => setRules((rs) => [...rs, { id: nextId(), kind: "value", tiers: ["High"] }])}>
            + Value tier
          </button>
          <button type="button" style={card} className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]"
            onClick={() => setRules((rs) => [...rs, { id: nextId(), kind: "cat", field: "region", values: [] }])}>
            + Region
          </button>
          <button type="button" style={card} className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]"
            onClick={() => setRules((rs) => [...rs, { id: nextId(), kind: "cat", field: "continent", values: [] }])}>
            + Continent
          </button>
          <button type="button" style={card} className="rounded-md border px-2.5 py-1.5 hover:border-[var(--accent)]"
            disabled={rules.some((r) => r.kind === "capital")}
            onClick={() => setRules((rs) => [...rs, { id: nextId(), kind: "capital" }])}>
            + Capital only
          </button>
        </div>

        {/* Lookalike expansion */}
        <div className="mt-4 rounded-lg border px-3 py-3" style={card}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Lookalike expansion</span>
            {lookalikeN > 0 && (
              <span className="text-xs tabular-nums" style={{ ...mono, color: ACCENT }}>+{lookalikes.length.toLocaleString()} added</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LOOKALIKE_STEPS.map((n) => {
              const on = lookalikeN === n;
              return (
                <button key={n} type="button" disabled={!canLookalike && n !== 0}
                  onClick={() => setLookalikeN(n)}
                  className="text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: on ? ACCENT : "transparent", color: on ? "var(--bg)" : "var(--text-muted)", borderColor: on ? ACCENT : "var(--border)" }}>
                  {n === 0 ? "Off" : `+${n}`}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-dim)] mt-2">
            Nearest metros to your segment's profile across the 16 dimensions. Lookalikes carry lower confidence and are still subject to the consent gate.
          </p>
        </div>

        {/* Sample members */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2">
            Sample members <span className="text-[var(--text-dim)]">(first {Math.min(effective.length, 14)})</span>
          </h2>
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 px-3 font-medium">Metro</th>
                  <th className="py-2 px-3 font-medium">Country</th>
                  <th className="py-2 px-3 font-medium">Propensity</th>
                  <th className="py-2 px-3 font-medium text-right">Consent</th>
                </tr>
              </thead>
              <tbody>
                {effective.slice(0, 14).map((p) => {
                  const sc = scoreOf.get(p.slug)!;
                  return (
                    <tr key={p.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 px-3 font-medium">
                        {p.name}
                        {lookalikeSlugs.has(p.slug) && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border align-middle"
                            style={{ borderColor: ACCENT, color: ACCENT }}>lookalike</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{p.country}</td>
                      <td className="py-1.5 px-3 tabular-nums" style={mono}>
                        <DataBar v={sc.propensity} max={PROPENSITY_MAX} width={104} label="propensity" />
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs" style={mono}>
                        <span style={{ color: p.governance.suppressed ? "#e74c3c" : p.governance.consent === "opted_in" ? ACCENT : "var(--text-dim)" }}>
                          {p.governance.suppressed ? "suppressed" : p.governance.consent.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {effective.length === 0 && (
                  <tr><td colSpan={4} className="py-4 px-3 text-xs text-[var(--text-dim)]">No metros match these rules.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------------- Results / gate ---------------- */}
      <aside className="lg:col-span-2">
        <div className="lg:sticky lg:top-4 space-y-4">
          <div className="rounded-xl border p-4" style={card}>
            <div className="text-xs text-[var(--text-muted)] mb-1">Cohort size</div>
            <div className="text-4xl font-semibold tabular-nums" style={mono}>
              {loaded ? effective.length.toLocaleString() : "…"}
            </div>
            <div className="text-xs text-[var(--text-dim)] mt-1">
              {loaded
                ? <>of {total.toLocaleString()} metros {"·"} {pctOfTotal}% of the universe</>
                : "loading dataset…"}
            </div>
            {lookalikeN > 0 && lookalikes.length > 0 && (
              <div className="text-xs text-[var(--text-dim)] mt-1" style={mono}>
                {members.length.toLocaleString()} seed {"+"} {lookalikes.length.toLocaleString()} lookalike
              </div>
            )}
          </div>

          {/* Distinctive signature */}
          {signature.length > 0 && (
            <div className="rounded-xl border p-4" style={card}>
              <div className="text-xs text-[var(--text-muted)] mb-2">Distinctive signature</div>
              <p className="text-[11px] text-[var(--text-dim)] mb-2">Where this audience over-indexes the universe, in percentile points.</p>
              <div className="space-y-1.5">
                {signature.map((s) => (
                  <div key={s.key} className="text-xs">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[var(--text-muted)]">{DIM_LABEL[s.key]}</span>
                      <span className="tabular-nums" style={{ ...mono, color: ACCENT }}>+{s.delta}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(s.delta * 2, 100)}%`, backgroundColor: ACCENT }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border p-4" style={card}>
            <div className="text-xs text-[var(--text-muted)] mb-2">Governance gate</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums" style={{ ...mono, color: GOLD }}>{stats.addressable.toLocaleString()}</span>
              <span className="text-xs text-[var(--text-muted)]">addressable (opted in)</span>
            </div>
            <div className="mt-2 space-y-1 text-xs" style={mono}>
              <Row label="Unknown consent" value={stats.unknown} />
              <Row label="Opted out" value={stats.optOut} />
              <Row label="Suppressed" value={stats.suppressed} />
            </div>
            <button type="button" disabled={stats.addressable === 0}
              onClick={() => setShowActivate(true)}
              className="mt-3 w-full rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: GOLD, color: "#1a1a1a" }}>
              Activate addressable audience {"→"}
            </button>
            <p className="text-[11px] text-[var(--text-dim)] mt-2">
              Suppression overrides everything; only opted-in rows are eligible to sync.
            </p>
          </div>

          <div className="rounded-xl border p-4" style={card}>
            <div className="text-xs text-[var(--text-muted)] mb-2">By region</div>
            <div className="space-y-1.5">
              {stats.region.slice(0, 8).map(([reg, n]) => {
                const w = effective.length ? Math.round((n / effective.length) * 100) : 0;
                return (
                  <div key={reg} className="text-xs">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[var(--text-muted)]">{reg}</span>
                      <span className="tabular-nums text-[var(--text-dim)]" style={mono}>{n.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: ACCENT }} />
                    </div>
                  </div>
                );
              })}
              {stats.region.length === 0 && <div className="text-xs text-[var(--text-dim)]">No members.</div>}
            </div>
          </div>

          {/* Saved segment library */}
          <div className="rounded-xl border p-4" style={card}>
            <div className="text-xs text-[var(--text-muted)] mb-2">Saved segments</div>
            {saved.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)]">None yet. Name a segment above and Save.</p>
            ) : (
              <div className="space-y-1">
                {saved.map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-2 text-xs">
                    <button type="button" onClick={() => loadSegment(s)}
                      className="truncate text-left hover:text-[var(--accent)] flex-1">
                      {s.name}
                      <span className="text-[var(--text-dim)]"> {"·"} {s.rules.length} rule{s.rules.length === 1 ? "" : "s"}{s.lookalikeN ? ` +${s.lookalikeN}` : ""}</span>
                    </button>
                    <button type="button" onClick={() => deleteSegment(s.name)} aria-label={`Delete ${s.name}`}
                      className="text-[var(--text-dim)] hover:text-[var(--accent)] shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {showActivate && (
        <ActivationModal
          audience={effective as ActProfile[]}
          segmentName={segName}
          onClose={() => setShowActivate(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--text-dim)]">{value.toLocaleString()}</span>
    </div>
  );
}
