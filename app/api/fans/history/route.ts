import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { resolveCanonical, getMethodSummary } from "@/lib/fanIndex";
import { SB_PUBLIC_URL, SB_PUBLIC_ANON_KEY } from "@/lib/supabasePublic";

// The full monthly attention history behind /fans/trends, gated the same
// way as app/api/fans/route.ts: a caller-supplied Supabase access token is
// re-verified against Supabase's own /auth/v1/user endpoint (never trusted
// as-is), then used AS the query's own Authorization header so RLS on
// public.fan_attention_history (authenticated-only, see supabase/
// migrations/20260924171144_fan_attention.sql) is what actually enforces
// the gate at the database layer, not just this route's own token check.
// See app/api/fans/route.ts's header comment for the full reasoning; this
// route copies it rather than importing it, matching that route's own
// choice not to share state across routes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The first trailing-12-month window that is fully after the June 2024
// bot/scraping correction to football pages' Wikipedia "user" pageviews
// (see this route's wikiTotalTrailing12 / clean-window comments below).
// Months before this are dropped from every response so nothing on
// /fans/trends ever shows a contaminated window.
const TRENDS_CLEAN_FROM = "2025-06";

const WIKI_TOTALS_PATH = join(process.cwd(), "data", "fans", "wikipedia_totals_monthly.json");

const SB_URL = SB_PUBLIC_URL;
const SB_ANON_KEY = SB_PUBLIC_ANON_KEY;

type SbUser = { id: string; email?: string | null };

async function resolveUser(token: string): Promise<SbUser | null> {
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = (await res.json()) as SbUser;
    return user && typeof user.id === "string" ? user : null;
  } catch {
    return null;
  }
}

// One row of data/fans/history/fan-attention-YYYY-MM.json's `teams` array
// (and of public.fan_attention_history.payload's `teams` array, same
// shape -- see that migration's table comment). NOT the full fan-attention
// index row: history keeps only wiki_baseline_12m (the rolling 12-month
// baseline AS OF that month, not that single month's raw pageviews -- see
// the HistoryTeam series comment below) plus rank and cross-sport score.
type HistoryTeamRow = {
  qid: string;
  team: string;
  group: string;
  league: string;
  wiki_baseline_12m: number;
  rank_in_group?: number;
  rank_in_league?: number;
  cross_sport_score?: number;
};

type HistoryMonthPayload = { year_month: string; method?: string; teams: HistoryTeamRow[] };

export type HistoryTeamOut = {
  key: string; // the team's Wikidata qid: stable across a rename/relocation, unlike `team`
  team: string;
  display_name: string;
  league: string;
  group: string;
  // One entry per `months`, oldest first. NOTE: this is each month's
  // wiki_baseline_12m -- the rolling 12-month spike-dampened baseline AS
  // COMPUTED THAT MONTH -- not that single month's raw Wikipedia pageviews.
  // data/fans/history/*.json (and its Supabase mirror) never stored true
  // single-month raw views; the rolling baseline is the only per-month,
  // per-team figure that exists in this archive. It still moves month to
  // month (enough to show real trend and league movement) but it is
  // smoothed by design, not a seasonal raw-traffic series. See app/fans/
  // trends/page.tsx's on-page note, which is worded to match this, not
  // the more literal "raw monthly pageviews" framing a first draft of this
  // page assumed before this file was actually inspected.
  series: (number | null)[];
  // Same length and month alignment as `series`, but each value is divided
  // by that month's trailing-12-month total human Wikipedia pageviews
  // (data/fans/wikipedia_totals_monthly.json, fetched by scripts/fans/
  // fetch_wikipedia_totals.py) and scaled by 1e9: views per billion
  // Wikipedia views that month. This removes Wikipedia's own overall
  // traffic decline (AI search reducing search-driven visits site-wide)
  // from the trend, so a falling `series` value does not automatically
  // read as the team/league itself losing attention. Null wherever the
  // trailing-12-month Wikipedia total is unavailable.
  normalized: (number | null)[];
};

export type HistoryPayload = {
  months: string[];
  teams: HistoryTeamOut[];
  // k_league per league (the same cross-sport scaling factor the All view
  // uses: cross_raw = fan_index_raw x k_league -- see lib/fanIndex.ts's
  // CROSS_SPORT_METHOD note), read from the committed data/fans/method-
  // summary.json rather than the gitignored full fan-attention.json, so
  // this route never needs a second Supabase read. Null for a league
  // method-summary.json has no k_league for (should not normally happen --
  // every league gets an anchor -- but the trends page treats a missing
  // value as "cross-sport view unavailable for this league" rather than
  // crashing).
  leagueKLeague: Record<string, number | null>;
};

// data/fans/wikipedia_totals_monthly.json: { "YYYY-MM": totalHumanPageviewsThatMonth }
// across all Wikipedia editions, written by scripts/fans/
// fetch_wikipedia_totals.py (Wikimedia's own pageviews REST API). Read
// fresh per assemble() call rather than cached at module load, since the
// monthly refresh can update this file between server restarts. Missing
// file or bad JSON degrades to "normalization unavailable" (all null),
// same fail-open spirit as leagueKLeague above.
function loadWikiTotals(): Record<string, number> {
  try {
    const raw = readFileSync(WIKI_TOTALS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function assemble(rows: { month: string; payload: HistoryMonthPayload }[]): HistoryPayload {
  const sorted = rows.slice().sort((a, b) => a.month.localeCompare(b.month));
  const months = sorted.map((r) => r.month);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const byQid = new Map<string, HistoryTeamOut>();
  for (const { month, payload } of sorted) {
    const idx = monthIndex.get(month);
    if (idx === undefined || !payload?.teams) continue;
    for (const t of payload.teams) {
      if (!t.qid) continue;
      let out = byQid.get(t.qid);
      if (!out) {
        out = {
          key: t.qid,
          team: t.team,
          display_name: t.team,
          league: t.league,
          group: t.group,
          series: new Array(months.length).fill(null),
          normalized: new Array(months.length).fill(null),
        };
        byQid.set(t.qid, out);
      }
      // Later months win for the label fields, so a renamed/relocated team
      // (Oakland Athletics -> Athletics) is labelled by its current name,
      // not whatever it was called in the first month it appears.
      out.team = t.team;
      out.league = t.league;
      out.group = t.group;
      out.series[idx] = typeof t.wiki_baseline_12m === "number" ? t.wiki_baseline_12m : null;
    }
  }

  // Trailing-12-month total human Wikipedia pageviews (all editions), one
  // entry per FULL `months` array (before the clean-window slice below),
  // so the first clean month (TRENDS_CLEAN_FROM) still gets a real trailing
  // sum built from the 11 months before it. Null wherever fewer than 12
  // consecutive months of totals are available for that window.
  const wikiTotals = loadWikiTotals();
  const wikiTrailing12: (number | null)[] = months.map((_, idx) => {
    if (idx < 11) return null;
    let sum = 0;
    for (let j = idx - 11; j <= idx; j++) {
      const v = wikiTotals[months[j]];
      if (typeof v !== "number") return null;
      sum += v;
    }
    return sum;
  });

  const teams = Array.from(byQid.values()).map((t) => {
    const { displayName } = resolveCanonical({ group: t.group, team: t.team, qid: t.key, rawDisplayName: null });
    // Views per billion trailing-12-month Wikipedia pageviews that month:
    // cancels out Wikipedia's own overall traffic decline (see
    // HistoryTeamOut.normalized comment).
    const normalized = t.series.map((v, idx) => {
      const total = wikiTrailing12[idx];
      if (v === null || !total) return null;
      return (v / total) * 1e9;
    });
    return { ...t, display_name: displayName, normalized };
  });

  const leagueKLeague: Record<string, number | null> = {};
  try {
    for (const l of getMethodSummary().leagues) leagueKLeague[l.league] = l.k_league;
  } catch {
    // data/fans/method-summary.json missing: leave leagueKLeague empty
    // rather than fail the whole history response -- the trends page's
    // cross-sport toggle degrades to "unavailable", raw and share (which
    // do not need k_league) are unaffected.
  }

  // Clean-window cut: every trailing-12-month window ending before June
  // 2024 is contaminated by a bot/scraping campaign that inflated football
  // pages' Wikipedia "user" pageviews (corrected that month). Drop every
  // month before TRENDS_CLEAN_FROM from what the API actually returns, so
  // nothing on /fans/trends can show a contaminated window even if a
  // caller ignores the note on the page.
  const cutIdx = months.findIndex((m) => m >= TRENDS_CLEAN_FROM);
  const start = cutIdx === -1 ? months.length : cutIdx;
  const cleanMonths = months.slice(start);
  const cleanTeams = teams.map((t) => ({
    ...t,
    series: t.series.slice(start),
    normalized: t.normalized.slice(start),
  }));

  return { months: cleanMonths, teams: cleanTeams, leagueKLeague };
}

function readLocalHistory(): HistoryPayload | null {
  const dir = join(process.cwd(), "data", "fans", "history");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^fan-attention-\d{4}-\d{2}\.json$/.test(f));
  if (files.length === 0) return null;
  const rows = files.map((f) => {
    const month = f.replace(/^fan-attention-/, "").replace(/\.json$/, "");
    const payload = JSON.parse(readFileSync(join(dir, f), "utf8")) as HistoryMonthPayload;
    return { month, payload };
  });
  return assemble(rows);
}

async function fetchAllFromSupabase(userToken: string): Promise<HistoryPayload | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/fan_attention_history?select=month,payload&order=month.asc`,
      {
        headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${userToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { month: string; payload: HistoryMonthPayload }[];
    if (!rows.length) return null;
    return assemble(rows);
  } catch {
    return null;
  }
}

// Module-memory cache, 1 hour. The assembled payload is not user-specific
// (RLS just gates WHO may ask, not different data per asker), so one
// server instance can safely share it across requests; each request still
// re-verifies its own token before ever returning it (see GET below).
const CACHE_TTL_MS = 60 * 60 * 1000;
let _cache: { data: HistoryPayload; expires: number } | null = null;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Sign in to see attention over time." }, { status: 401 });
  }

  const user = await resolveUser(token);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  if (_cache && _cache.expires > Date.now()) {
    return NextResponse.json(_cache.data, { headers: { "Cache-Control": "private, no-store" } });
  }

  const isDev = process.env.NODE_ENV !== "production";
  const forceLocal = isDev && process.env.FANS_SOURCE === "local";

  let payload: HistoryPayload | null = null;
  let usedLocalFallback = false;

  if (!forceLocal) {
    payload = await fetchAllFromSupabase(token);
  }

  // Dev fallback ONLY: NODE_ENV !== production AND (Supabase returned no
  // rows OR FANS_SOURCE=local was explicitly requested), same shape as
  // app/api/fans/route.ts's local-file fallback, so Ashwin can review new
  // history data locally (FANS_SOURCE=local) without it ever reaching
  // production, where this branch can never run.
  if (!payload && isDev) {
    const local = readLocalHistory();
    if (local) {
      payload = local;
      usedLocalFallback = true;
      console.warn(
        `[api/fans/history] ${forceLocal ? "FANS_SOURCE=local set" : "public.fan_attention_history returned no rows"}; ` +
          "NODE_ENV!==production, serving data/fans/history/*.json instead.",
      );
    }
  }

  if (!payload) {
    return NextResponse.json(
      { error: usedLocalFallback ? "No history available." : "Attention history is not available right now." },
      { status: 503 },
    );
  }

  _cache = { data: payload, expires: Date.now() + CACHE_TTL_MS };

  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
