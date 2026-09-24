import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseFanIndexPayload, toFanTablePayload, getFanIndexFromLocalFile } from "@/lib/fanIndex";
import { SB_PUBLIC_URL, SB_PUBLIC_ANON_KEY } from "@/lib/supabasePublic";

// The ONLY place the full Fan Attention Index (all 770 teams, every field)
// is served to a browser. The public /fans page renders a small top-20
// preview server-side from the committed data/fans/preview.json and never
// touches this data; the client fetches this route, with its own Supabase
// access token, once it has confirmed a signed-in session, and renders the
// full table from the JSON this returns. See lib/fanIndex.ts's GATING note
// and scripts/fans/README.md.
//
// WHY THE TOKEN IS RE-VERIFIED HERE, NOT TRUSTED FROM THE CLIENT. Same
// reasoning as app/api/feedback/route.ts: the client's Supabase access
// token is the only thing that proves who is asking, and it is proven by
// asking Supabase's own /auth/v1/user endpoint to resolve it, not by
// decoding the JWT locally.
//
// WHY THE DATA QUERY ALSO USES THE USER'S TOKEN, NOT A SERVICE KEY (2026-09-24).
// The full dataset moved to Supabase (public.fan_attention_teams) because the
// repo is public and can no longer carry it even server-only. That table's
// RLS grants SELECT to the `authenticated` role only (see supabase/
// migrations/20260924171144_fan_attention.sql) -- no anon policy exists at
// all. This route therefore queries PostgREST with the CALLER'S OWN verified
// token as the Authorization header (not a service_role key): if the token
// did not verify above, RLS itself would already refuse the read even if
// this route forgot to check. Two independent gates, not one. Never widen
// this to a service-role read here. app/fans/methodology/page.tsx needs no
// such read at all: it gets its group-level aggregates from the committed
// data/fans/method-summary.json via getMethodSummary() in lib/fanIndex.ts,
// never from this table.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SB_URL = SB_PUBLIC_URL;
const SB_ANON_KEY = SB_PUBLIC_ANON_KEY;

type SbUser = { id: string; email?: string | null };

/** Exchange a caller-supplied access token for the identity Supabase says it
 *  belongs to. Returns null for anything that does not verify. */
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

// Latest row of public.fan_attention_teams, read with the CALLER's token so
// RLS (authenticated-only) applies. Returns null on any failure or an empty
// table -- both are handled by the local-file dev fallback below, not by
// throwing, so a Supabase hiccup degrades to a clear error response rather
// than a 500.
async function fetchLatestFromSupabase(userToken: string): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/fan_attention_teams?select=payload&order=generated_at.desc&limit=1`,
      {
        headers: { apikey: SB_ANON_KEY, Authorization: `Bearer ${userToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { payload: unknown }[];
    return rows.length ? rows[0].payload : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Sign in to see the full Fan Attention Index." }, { status: 401 });
  }

  const user = await resolveUser(token);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  // FANS_SOURCE=local (dev only): skip the Supabase read entirely and go
  // straight to the local-file fallback below, so Ashwin can review new
  // data/fans/fan-attention.json output locally (a fresh csv_to_json.py
  // run he has not pushed to Supabase yet) without that data ever reaching
  // production -- this branch can only ever be taken when NODE_ENV is not
  // "production", same guard as the existing empty-table fallback.
  const isDev = process.env.NODE_ENV !== "production";
  const forceLocal = isDev && process.env.FANS_SOURCE === "local";
  const raw = forceLocal ? null : await fetchLatestFromSupabase(token);

  // Local dev convenience ONLY: if Supabase has nothing yet (a fresh dev
  // database, or scripts/fans/push_to_supabase.py has never run locally),
  // or FANS_SOURCE=local was explicitly set, and this is not a production
  // server, fall back to the gitignored local data/fans/fan-attention.json
  // a dev has built with csv_to_json.py, so /fans keeps working while the
  // Supabase side of the pipeline is being set up (or while reviewing data
  // that has not been pushed yet). Never falls back in production: a
  // production Supabase table that is empty is a real incident, not
  // something to paper over with whatever JSON happens to be on the
  // server's disk.
  let usedLocalFallback = false;
  if (!raw && isDev) {
    const local = getFanIndexFromLocalFile();
    if (local) {
      usedLocalFallback = true;
      console.warn(
        `[api/fans] ${forceLocal ? "FANS_SOURCE=local set" : "public.fan_attention_teams returned no rows"}; ` +
          "NODE_ENV!==production, serving the local data/fans/fan-attention.json instead." +
          (forceLocal ? "" : " Run scripts/fans/push_to_supabase.py to populate Supabase."),
      );
      return NextResponse.json(
        {
          version: local.version,
          generated: local.generated,
          window: local.window,
          methodUrl: local.methodUrl,
          groups: local.groups,
          teams: toFanTablePayload(local),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }

  if (!raw) {
    return NextResponse.json(
      { error: usedLocalFallback ? "No data available." : "The Fan Attention Index is not available right now." },
      { status: 503 },
    );
  }

  const data = parseFanIndexPayload(raw as Parameters<typeof parseFanIndexPayload>[0]);
  return NextResponse.json(
    {
      version: data.version,
      generated: data.generated,
      window: data.window,
      methodUrl: data.methodUrl,
      groups: data.groups,
      teams: toFanTablePayload(data),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
