# -*- coding: utf-8 -*-
"""Generate a hub's TypeScript from its editorial config.

    python3 scripts/elections/gen_hub_code.py pe ke vd

Writes lib/<cc>Elections.ts, app/elections/<cc>/page.tsx and
app/elections/<cc>/[id]/page.tsx from HUBS[cc] (hub_editorial.py, or the
per-hub module scripts/elections/hubs/<cc>.py). The three shapes ("leg",
"pres", "combined") follow the hand-finished Pakistan, Philippines and
Colombia hubs of the earlier waves, so a generated hub reads like the rest of
the family; anything a hub needs beyond the config is a normal edit to the
generated file afterwards, and this script is not re-run over it.

Config keys the generator reads (all in HUBS[cc]):
  shape, name, adj, title, desc, sources, tiles, how, charts, links,
  legNoun, presNoun, chamber, role, roleShort, capital, locale (default en-GB),
  chartFrom (first year of the chart series; default: none),
  records ([(label, value, electionId, detail), ...] appended to the derived
  records), colorRules ([(regex, colour), ...] fallbacks after the exact map).
"""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_editorial as E

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ts_str(s):
    return json.dumps(s, ensure_ascii=False)


def jsx_text(s):
    # Apostrophes and quotes inside JSX text are fine as-is; only braces and
    # angle brackets need care, and the copy never carries them.
    return s.replace("{", "&#123;").replace("}", "&#125;")


def color_map(cc, cfg):
    cols = E.COLORS.get(cc, {})
    lines = ["const P: Record<string, string> = {"]
    for k, v in cols.items():
        lines.append("  %s: %s," % (ts_str(k), ts_str(v)))
    lines.append("};")
    rules = cfg.get("colorRules", [])
    rule_lines = "".join("  if (/%s/i.test(name)) return %s;\n" % (rx, ts_str(col)) for rx, col in rules)
    return "\n".join(lines), rule_lines


LIB_HEAD = '''import "server-only";
import fs from "fs";
import path from "path";

// ---------------- types ----------------
export type {Cc}ElectionParty = {
  name: string | null;
  leader: string | null;
  seats: number | null;
  seatChange: number | null;
  votes: number | null;
  share: number | null;
  swing: number | null;
};
'''

LEG_TYPE = '''export type {Cc}LegElection = {
  id: string;
  label: string;
  year: number;
  kind: "legislative";
  date: string;
  era: string;
  totalSeats: number | null;
  majoritySeats: number | null;
  turnout: number | null;
  parties: {Cc}ElectionParty[];
  pmBefore: { name: string; party: string | null } | null;
  pmAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  seatLeader: string | null;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
'''

PRES_TYPE = '''export type {Cc}PresCandidate = {
  name: string;
  party: string | null;
  r1Votes: number | null;
  r1Share: number | null;
  r2Votes: number | null;
  r2Share: number | null;
};
export type {Cc}PresElection = {
  id: string; // "pres-YYYY"
  label: string;
  year: number;
  kind: "presidential";
  date: string;
  era: string;
  turnout: number | null;
  turnout2: number | null;
  candidates: {Cc}PresCandidate[];
  presBefore: { name: string; party: string | null } | null;
  presAfter: { name: string; party: string | null } | null;
  knownAs: string | null;
  summary: string;
  caveat?: string | null;
  unfree?: "partial" | "unfree" | null;
};
'''

FILE_TYPE = {
 "leg": '''export type {Cc}ElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: {Cc}LegElection[];
};
''',
 "pres": '''export type {Cc}ElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  eras: { key: string; label: string; span: string; blurb: string }[];
  elections: {Cc}PresElection[];
};
''',
 "combined": '''export type {Cc}ElectionsFile = {
  meta: { title: string; sources: string[]; built: string; status?: string; dissolved?: string | null };
  presEras: { key: string; label: string; span: string; blurb: string }[];
  legEras: { key: string; label: string; span: string; blurb: string }[];
  presidential: {Cc}PresElection[];
  legislative: {Cc}LegElection[];
};
''',
}

LOADER = '''
// ---------------- loader ----------------
let _core: {Cc}ElectionsFile | null = null;
export function get{Cc}Elections(): {Cc}ElectionsFile {
  return (_core ??= JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "{cc}-elections.json"), "utf-8"),
  ) as {Cc}ElectionsFile);
}

// ---------------- party colors ----------------
// Conventional {adj} party colours; the name always accompanies the colour.
{COLORMAP}
export function {cc}PartyColor(name: string | null | undefined): string {
  if (!name) return "#9ca3af";
  const hit = P[name];
  if (hit) return hit;
{COLORRULES}  if (/Independen/i.test(name)) return "#9ca3af";
  // Anything still unmatched takes neutral grey rather than borrowing a colour
  // from a party family it does not belong to.
  return "#9ca3af";
}

// ---------------- helpers ----------------
'''

HELPERS = {
 "leg": '''export function {cc}EraOf(key: string) {
  return get{Cc}Elections().eras.find((e) => e.key === key) ?? null;
}
export function {cc}ElectionById(id: string): {Cc}LegElection | null {
  return get{Cc}Elections().elections.find((e) => e.id === id) ?? null;
}
export function {cc}Neighbours(id: string): { prev: {Cc}LegElection | null; next: {Cc}LegElection | null } {
  const els = get{Cc}Elections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
''',
 "pres": '''export function {cc}EraOf(key: string) {
  return get{Cc}Elections().eras.find((e) => e.key === key) ?? null;
}
export function {cc}ElectionById(id: string): {Cc}PresElection | null {
  return get{Cc}Elections().elections.find((e) => e.id === id) ?? null;
}
export function {cc}Neighbours(id: string): { prev: {Cc}PresElection | null; next: {Cc}PresElection | null } {
  const els = get{Cc}Elections().elections;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function {cc}WinnerOf(e: {Cc}PresElection): {Cc}PresCandidate | null {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  return byR2[0] ?? byR1[0] ?? e.candidates[0] ?? null;
}
''',
 "combined": '''export function {cc}LegEraOf(key: string) {
  return get{Cc}Elections().legEras.find((e) => e.key === key) ?? null;
}
export function {cc}PresEraOf(key: string) {
  return get{Cc}Elections().presEras.find((e) => e.key === key) ?? null;
}
export function {cc}ElectionById(id: string): {Cc}LegElection | {Cc}PresElection | null {
  const f = get{Cc}Elections();
  return f.legislative.find((e) => e.id === id) ?? f.presidential.find((e) => e.id === id) ?? null;
}
export function {cc}LegNeighbours(id: string): { prev: {Cc}LegElection | null; next: {Cc}LegElection | null } {
  const els = get{Cc}Elections().legislative;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
export function {cc}PresNeighbours(id: string): { prev: {Cc}PresElection | null; next: {Cc}PresElection | null } {
  const els = get{Cc}Elections().presidential;
  const i = els.findIndex((e) => e.id === id);
  return { prev: i > 0 ? els[i - 1] : null, next: i >= 0 && i < els.length - 1 ? els[i + 1] : null };
}
''',
}

FMT = '''export const {cc}FmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString({locale}));
export const {cc}FmtPct = (n: number | null | undefined, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);

// Records and superlatives, derived from the file so they cannot drift from it.
// Contests this atlas labels unfree are excluded from the turnout and share
// records, because their figures were reported rather than counted.
export type {Cc}ElectionRecord = { label: string; value: string; electionId: string; detail: string };
export function compute{Cc}Records(): {Cc}ElectionRecord[] {
  const recs: {Cc}ElectionRecord[] = [];
'''

RECORDS_LEG = '''  const els = get{Cc}Elections().{legkey}.filter((e) => e.unfree !== "unfree");
  const withTurnout = els.filter((e) => e.turnout != null);
  if (withTurnout.length) {
    const hi = withTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = withTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest turnout", value: {cc}FmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest turnout", value: {cc}FmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const withShare = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.share != null && (x.p.share ?? 0) <= 100);
  if (withShare.length) {
    const top = withShare.reduce((a, b) => ((a.p.share ?? 0) >= (b.p.share ?? 0) ? a : b));
    recs.push({ label: "Highest vote share", value: {cc}FmtPct(top.p.share), electionId: top.e.id, detail: `${top.p.name}, ${top.e.label}` });
  }
  const withSeats = els.flatMap((e) => e.parties.map((p) => ({ e, p }))).filter((x) => x.p.seats != null);
  if (withSeats.length) {
    const haul = withSeats.reduce((a, b) => ((a.p.seats ?? 0) >= (b.p.seats ?? 0) ? a : b));
    recs.push({ label: "Most seats won", value: {cc}FmtInt(haul.p.seats), electionId: haul.e.id, detail: `${haul.p.name}, ${haul.e.label}` });
  }
'''

RECORDS_PRES = '''  const pres = get{Cc}Elections().{preskey}.filter((e) => e.unfree !== "unfree");
  const presTurnout = pres.filter((e) => e.turnout != null);
  if (presTurnout.length) {
    const hi = presTurnout.reduce((a, b) => ((a.turnout ?? 0) >= (b.turnout ?? 0) ? a : b));
    const lo = presTurnout.reduce((a, b) => ((a.turnout ?? 100) <= (b.turnout ?? 100) ? a : b));
    recs.push({ label: "Highest presidential turnout", value: {cc}FmtPct(hi.turnout), electionId: hi.id, detail: `${hi.label}, of the elections with a recorded figure` });
    recs.push({ label: "Lowest presidential turnout", value: {cc}FmtPct(lo.turnout), electionId: lo.id, detail: `${lo.label}` });
  }
  const winners = pres
    .map((e) => {
      const w = e.candidates
        .filter((c) => (c.r2Share ?? c.r1Share) != null && ((c.r2Share ?? c.r1Share) as number) <= 100)
        .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
      return w ? { e, w, share: (w.r2Share ?? w.r1Share) as number } : null;
    })
    .filter((x): x is { e: {Cc}PresElection; w: {Cc}PresCandidate; share: number } => x != null);
  if (winners.length) {
    const big = winners.reduce((a, b) => (a.share >= b.share ? a : b));
    const contested = winners.filter((x) => x.e.candidates.length > 1);
    const narrow = contested.length ? contested.reduce((a, b) => (a.share <= b.share ? a : b)) : null;
    recs.push({ label: "Largest presidential win", value: {cc}FmtPct(big.share), electionId: big.e.id, detail: `${big.w.name}, ${big.e.label}` });
    if (narrow) recs.push({ label: "Narrowest presidential win", value: {cc}FmtPct(narrow.share), electionId: narrow.e.id, detail: `${narrow.w.name}, ${narrow.e.label}` });
  }
'''


def lib_ts(cc, cfg):
    Cc = cc.capitalize()
    shape = cfg["shape"]
    cmap, rules = color_map(cc, cfg)
    parts = [LIB_HEAD]
    if shape in ("leg", "combined"):
        parts.append(LEG_TYPE)
    if shape in ("pres", "combined"):
        parts.append(PRES_TYPE)
    parts.append(FILE_TYPE[shape])
    parts.append(LOADER.replace("{COLORMAP}", cmap).replace("{COLORRULES}", rules))
    parts.append(HELPERS[shape])
    parts.append(FMT)
    if shape == "leg":
        parts.append(RECORDS_LEG.replace("{legkey}", "elections"))
    elif shape == "pres":
        parts.append(RECORDS_PRES.replace("{preskey}", "elections"))
    else:
        parts.append(RECORDS_PRES.replace("{preskey}", "presidential"))
        parts.append(RECORDS_LEG.replace("{legkey}", "legislative"))
    for label, value, eid, detail in cfg.get("records", []):
        parts.append("  recs.push({ label: %s, value: %s, electionId: %s, detail: %s });\n"
                     % (ts_str(label), ts_str(value), ts_str(eid), ts_str(detail)))
    parts.append("  return recs;\n}\n")
    out = "".join(parts)
    return (out.replace("{Cc}", Cc).replace("{cc}", cc).replace("{adj}", cfg["adj"])
               .replace("{locale}", ts_str(cfg.get("locale", "en-GB"))))


# --------------------------------------------------------------- pages -------

PRES_CARD = '''
function PresCard({ e }: { e: {Cc}PresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/{cc}/${e.id}`}
      className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-[var(--text)]">{e.label}</span>
          {e.unfree ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.unfree === "unfree" ? "Not a free vote" : "Restricted"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3 flex-wrap">
          {winner ? (
            <span>
              <span style={{ color: {cc}PartyColor(winner.party) }}>{winner.name}</span>{" "}
              {{cc}FmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {{cc}FmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: {cc}PartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${{cc}FmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: {cc}PartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${{cc}FmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}
'''

PRES_SECTION = '''
      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          {PRESINTRO}
        </p>
        {presByEra.map(({ era, list }) => (
          <div key={era.key} id={`pres-era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => <PresCard key={e.id} e={e} />)}
            </div>
          </div>
        ))}
      </section>
'''

CHART_BOX = '''          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">{TITLE}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              {CAPTION}
            </p>
            <LineChart series={[{SERIES}]} yMax={{YMAX}} yTicks={{TICKS}} />
          </div>
'''


def chart_box(title, caption, series, ymax, ticks):
    return (CHART_BOX.replace("{TITLE}", jsx_text(title)).replace("{CAPTION}", jsx_text(caption))
            .replace("{SERIES}", series).replace("{YMAX}", str(ymax)).replace("{TICKS}", json.dumps(ticks)))


def page_tsx(cc, cfg):
    Cc = cc.capitalize()
    shape = cfg["shape"]
    intro = E.INTROS.get(cc, {})
    chart_from = cfg.get("chartFrom")
    imports = ["get%sElections" % Cc, "compute%sRecords" % Cc, "%sPartyColor" % cc, "%sFmtPct" % cc]
    if shape != "leg":
        imports.append("type %sPresElection" % Cc)
    shared = ["StatTile", "JumpNav"] + (["Chronology"] if shape != "pres" else []) + ["RecordsGrid", "HowItWorks", "HubFooter", "HubTitle"]
    head = '''import type { Metadata } from "next";
import Link from "next/link";
import { %s } from "@/lib/%sElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { %s } from "../HubShared";

const PATH = "/elections/%s";
const TITLE = %s;
const DESC =
  %s;

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};
''' % (", ".join(imports), cc, ", ".join(shared), cc, ts_str(cfg["title"]), ts_str(cfg["desc"]))
    body = head
    if shape != "leg":
        body += PRES_CARD
    # ---- component open ----
    if shape == "leg":
        body += '''
export default function %sElectionsPage() {
  const { eras, elections, meta } = get%sElections();
  const records = compute%sRecords();
  const last = elections[elections.length - 1];
  const modern = elections%s;

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const largest: ChartSeries = {
    name: "Largest party's vote share",
    color: "#8A7CA8",
    points: modern
      .map((e) => {
        const p = e.parties
          .filter((p) => p.share != null && (p.share as number) <= 100)
          .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
        return p ? { x: e.year, y: p.share as number, label: `${e.label}, ${p.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
''' % (Cc, Cc, Cc, (".filter((e) => e.year >= %d)" % chart_from) if chart_from else "")
        series = ("turnout", "largest")
        counts = "elections.length"
    else:
        key = "elections" if shape == "pres" else "presidential"
        body += '''
export default function %sElectionsPage() {
  const { %s, meta } = get%sElections();
  const records = compute%sRecords();
  const modern = %s%s;

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: modern
      .map((e) => {
        const w = e.candidates
          .filter((c) => (c.r2Share ?? c.r1Share) != null)
          .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
        return w ? { x: e.year, y: (w.r2Share ?? w.r1Share) as number, label: `${e.label}: ${w.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  const presByEra = [...%s]
    .reverse()
    .map((era) => ({ era, list: %s.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);
''' % (Cc,
       "eras, elections" if shape == "pres" else "presEras, legEras, presidential, legislative",
       Cc, Cc, key, (".filter((e) => e.year >= %d)" % chart_from) if chart_from else "",
       "eras" if shape == "pres" else "presEras", key)
        series = ("presTurnout", "winnerShare")
        counts = "elections.length" if shape == "pres" else "presidential.length + legislative.length"

    # ---- tiles ----
    tiles = []
    for label, value, hint in cfg["tiles"]:
        if value is None:
            tiles.append('        <StatTile label={%s} value={String(%s)} hint={""} />' % (ts_str(label), counts))
        else:
            tiles.append('        <StatTile label={%s} value={%s} hint={%s} />' % (ts_str(label), ts_str(value), ts_str(hint or "")))
    if shape == "leg":
        tiles.append('        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />')
    jump = ([["#presidential", "Presidential elections"]] if shape == "combined" else []) + \
           [["#chronology", "Chronology" if shape != "combined" else cfg.get("legHeadline", "Legislative elections")]] + \
           [["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]
    body += '''
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>%s</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="%s" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
%s
      </div>

      <JumpNav items={%s} />
''' % (jsx_text(cfg["name"]), cc, "\n".join(tiles), json.dumps(jump, ensure_ascii=False))

    if shape == "combined":
        body += PRES_SECTION.replace("{PRESINTRO}", jsx_text(intro.get("pres", "")))
        body += '''
      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={%sPartyColor}
        fmtPct={%sFmtPct}
        leaderTag=%s
        headline=%s
        intro={%s}
      />
''' % (cc, cc, ts_str(cfg.get("roleShort", "PM")), ts_str(cfg.get("legHeadline", "Legislative elections")), ts_str(intro.get("leg", "")))
    elif shape == "leg":
        body += '''
      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={%sPartyColor}
        fmtPct={%sFmtPct}
        leaderTag=%s
        intro={%s}
      />
''' % (cc, cc, ts_str(cfg.get("roleShort", "PM")), ts_str(intro.get("leg", "")))
    else:
        body += '''
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          %s
        </p>
        {presByEra.map(({ era, list }) => (
          <div key={era.key} id={`era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => <PresCard key={e.id} e={e} />)}
            </div>
          </div>
        ))}
      </section>
''' % jsx_text(intro.get("pres", ""))

    (t1, c1), (t2, c2) = cfg["charts"]
    body += '''
      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
''' + chart_box(t1, c1, series[0], 100, [50, 75]) + chart_box(t2, c2, series[1], cfg.get("shareYMax", 100), cfg.get("shareTicks", [25, 50, 75])) + '''        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title=%s
        cards={[
%s
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
%s
        ]}
      />
    </main>
  );
}
''' % (ts_str("How %s elections work" % cfg["adj"]),
       "\n".join("          [%s,\n           %s]," % (ts_str(h), ts_str(t)) for h, t in cfg["how"]),
       "\n".join("          [%s, %s]," % (ts_str(h), ts_str(l)) for h, l in cfg["links"]))
    return body.replace("{Cc}", Cc).replace("{cc}", cc)


def detail_tsx(cc, cfg):
    Cc = cc.capitalize()
    shape = cfg["shape"]
    hub_name = cfg["name"]
    if shape == "leg":
        return '''import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { {cc}ElectionById, {cc}Neighbours, {cc}EraOf, {cc}PartyColor, {cc}FmtInt, {cc}FmtPct } from "@/lib/{cc}Elections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) return {};
  const title = `${e.label} {LEGNOUN}`;
  const path = `/elections/{cc}/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function {Cc}ElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) notFound();
  const { prev, next } = {cc}Neighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={{cc}EraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/{cc}",
        hubName: {HUBNAME},
        headingSuffix: {LEGNOUN_S},
        roleLabel: {ROLE},
        chamberFallback: {CHAMBER},
        colorOf: {cc}PartyColor,
        fmtInt: {cc}FmtInt,
        fmtPct: {cc}FmtPct,
      }}
    />
  );
}
'''.replace("{LEGNOUN_S}", ts_str(cfg["legNoun"])).replace("{LEGNOUN}", cfg["legNoun"]).replace("{HUBNAME}", ts_str(hub_name)) \
   .replace("{ROLE}", ts_str(cfg.get("role", "Prime Minister"))).replace("{CHAMBER}", ts_str(cfg.get("chamber", "the legislature"))) \
   .replace("{Cc}", Cc).replace("{cc}", cc)
    if shape == "pres":
        return '''import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { {cc}ElectionById, {cc}Neighbours, {cc}EraOf, {cc}PartyColor, {cc}FmtInt, {cc}FmtPct } from "@/lib/{cc}Elections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) return {};
  const title = `${e.label} {PRESNOUN}`;
  const path = `/elections/{cc}/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function {Cc}ElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) notFound();
  const { prev, next } = {cc}Neighbours(e.id);
  return (
    <PresElectionDetail
      e={e}
      era={{cc}EraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/{cc}",
        hubName: {HUBNAME},
        headingSuffix: {PRESNOUN_S},
        eraAnchorPrefix: "era-",
        colorOf: {cc}PartyColor,
        fmtInt: {cc}FmtInt,
        fmtPct: {cc}FmtPct,
      }}
    />
  );
}
'''.replace("{PRESNOUN_S}", ts_str(cfg["presNoun"])).replace("{PRESNOUN}", cfg["presNoun"]).replace("{HUBNAME}", ts_str(hub_name)) \
   .replace("{Cc}", Cc).replace("{cc}", cc)
    return '''import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  {cc}ElectionById,
  {cc}LegNeighbours,
  {cc}PresNeighbours,
  {cc}LegEraOf,
  {cc}PresEraOf,
  {cc}PartyColor,
  {cc}FmtInt,
  {cc}FmtPct,
} from "@/lib/{cc}Elections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import PresElectionDetail from "../../PresDetailShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} {PRESNOUN}` : `${e.label} {LEGNOUN}`;
  const path = `/elections/{cc}/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

export default async function {Cc}ElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = {cc}ElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    const { prev, next } = {cc}PresNeighbours(e.id);
    return (
      <PresElectionDetail
        e={e}
        era={{cc}PresEraOf(e.era)}
        prev={prev}
        next={next}
        cfg={{
          hubHref: "/elections/{cc}",
          hubName: {HUBNAME},
          headingSuffix: {PRESNOUN_S},
          eraAnchorPrefix: "pres-era-",
          colorOf: {cc}PartyColor,
          fmtInt: {cc}FmtInt,
          fmtPct: {cc}FmtPct,
        }}
      />
    );
  }
  const { prev, next } = {cc}LegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={{cc}LegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/{cc}",
        hubName: {HUBNAME},
        headingSuffix: {LEGNOUN_S},
        roleLabel: {ROLE},
        chamberFallback: {CHAMBER},
        colorOf: {cc}PartyColor,
        fmtInt: {cc}FmtInt,
        fmtPct: {cc}FmtPct,
      }}
    />
  );
}
'''.replace("{PRESNOUN_S}", ts_str(cfg["presNoun"])).replace("{PRESNOUN}", cfg["presNoun"]) \
   .replace("{LEGNOUN_S}", ts_str(cfg["legNoun"])).replace("{LEGNOUN}", cfg["legNoun"]).replace("{HUBNAME}", ts_str(hub_name)) \
   .replace("{ROLE}", ts_str(cfg.get("role", "President"))).replace("{CHAMBER}", ts_str(cfg.get("chamber", "the legislature"))) \
   .replace("{Cc}", Cc).replace("{cc}", cc)


def write(rel, text):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(text)
    print("wrote", rel)


if __name__ == "__main__":
    for cc in sys.argv[1:]:
        cfg = E.HUBS[cc]
        write("lib/%sElections.ts" % cc, lib_ts(cc, cfg))
        write("app/elections/%s/page.tsx" % cc, page_tsx(cc, cfg))
        write("app/elections/%s/[id]/page.tsx" % cc, detail_tsx(cc, cfg))
