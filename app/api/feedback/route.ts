import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

// Reader feedback relay: corrections, coverage requests, ideas and bugs.
//
// WHY A RELAY AND NOT A CLIENT INSERT. The anon key ships in every browser
// bundle, so an RLS insert policy for `authenticated` would let anyone POST
// straight to PostgREST with their own token, skipping the rate limit and the
// field validation below. public.feedback therefore has NO insert policy at
// all, and this route is the only writer. Same reasoning as the track_visit
// lockdown in app/api/v/route.ts.
//
// WHY THE TOKEN IS RE-VERIFIED HERE. The client sends its Supabase access
// token as a Bearer header. We do not decode it locally and we never read a
// user id out of the request body: both are client-controlled. Instead we call
// Supabase's /auth/v1/user with the token, which is the only thing that proves
// the caller is who they claim. The user id and email we store come from that
// response, not from the browser.
const SB_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nmprqkmymrdknffwnuur.supabase.co";
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["correction", "coverage", "idea", "bug"]);
const MAX_BODY = 4000;

// x-real-ip is set once by the edge and cannot be appended to by the client.
// x-forwarded-for is a hop chain the client can prepend to, so only its LAST
// entry (the one the edge added) is trustworthy. Copied from the admin login
// route so both limiters key on the same notion of "the caller".
function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

function bad(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type SbUser = {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null };
};

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

export async function POST(req: NextRequest) {
  // Fail loudly rather than silently dropping a reader's report: unlike the
  // analytics beacon, someone is waiting for a confirmation here.
  if (!SB_SERVICE_KEY) return bad("Feedback is not configured right now.", 503);

  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return bad("Sign in to send feedback.", 401);

  // Two limits, both cheap. The IP limit blunts a token farm; the per-user
  // limit stops one signed-in account flooding the table.
  const ipLimit = await checkRateLimit(`feedback-ip:${clientIp(req)}`, 20, 60 * 60_000);
  if (!ipLimit.ok) return bad("Too many reports from this connection. Try again later.", 429);

  const user = await resolveUser(token);
  if (!user) return bad("Your session has expired. Sign in again.", 401);

  const userLimit = await checkRateLimit(`feedback-user:${user.id}`, 10, 60 * 60_000);
  if (!userLimit.ok) return bad("You have sent a lot of reports in the last hour. Try again later.", 429);

  let kind = "";
  let path = "";
  let body = "";
  try {
    const json = await req.json();
    if (typeof json?.kind === "string") kind = json.kind;
    if (typeof json?.path === "string") path = json.path.slice(0, 512);
    if (typeof json?.body === "string") body = json.body.trim().slice(0, MAX_BODY);
  } catch {
    return bad("Malformed request.", 400);
  }

  if (!KINDS.has(kind)) return bad("Pick what kind of report this is.", 400);
  if (body.length < 3) return bad("Tell us a little more than that.", 400);
  // `path` is the route the reader was on. It is display-only in the admin
  // view and never used to build a link, but keep it to a same-origin shape so
  // a pasted absolute URL cannot smuggle another host into the table.
  if (!path.startsWith("/")) path = "/";

  try {
    const res = await fetch(`${SB_URL}/rest/v1/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        kind,
        path,
        body,
      }),
    });
    if (!res.ok) return bad("Could not save that. Try again in a moment.", 502);
  } catch {
    return bad("Could not save that. Try again in a moment.", 502);
  }

  return NextResponse.json({ ok: true });
}
