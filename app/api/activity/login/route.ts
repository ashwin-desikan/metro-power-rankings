import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACTIVITY_COOKIE,
  SESSION_TTL_SECONDS,
  issueSession,
  verifyPassword,
} from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Mirrors app/api/admin/login/route.ts's open-redirect guard, scoped to
// /activity instead of /admin.
function safePathname(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "/activity";
  if (!input.startsWith("/activity")) return "/activity";
  return input;
}

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

export async function POST(req: NextRequest) {
  // Same throttle shape as admin login: 10 attempts / 15 min / IP.
  const rl = await checkRateLimit(`activity-login:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) {
    return new NextResponse("Too many attempts. Try again later.", {
      status: 429,
      headers: {
        "content-type": "text/plain",
        "retry-after": String(rl.retryAfter),
      },
    });
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safePathname(String(form.get("next") ?? "/activity"));

  const expected = process.env.ACTIVITY_PASSWORD;
  const secret = process.env.ACTIVITY_SESSION_SECRET;

  if (!expected || !secret) {
    return new NextResponse(
      "ACTIVITY_PASSWORD and ACTIVITY_SESSION_SECRET must both be set on this deployment.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  if (!(await verifyPassword(password, expected))) {
    const url = req.nextUrl.clone();
    url.pathname = "/activity/login";
    url.search = "";
    url.searchParams.set("error", "bad");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await issueSession(secret);

  const url = req.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(ACTIVITY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
