import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_TTL_SECONDS,
  issueSession,
  verifyPassword,
} from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Only allow same-origin internal redirects under /admin to avoid an
// open redirect via ?next=.
function safePathname(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "/admin";
  if (!input.startsWith("/admin")) return "/admin";
  return input;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  // Throttle online password guessing: 10 attempts / 15 min / IP.
  const rl = await checkRateLimit(`admin-login:${clientIp(req)}`, 10, 15 * 60_000);
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
  const next = safePathname(String(form.get("next") ?? "/admin"));

  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!expected || !secret) {
    return new NextResponse(
      "ADMIN_PASSWORD and ADMIN_SESSION_SECRET must both be set on this deployment.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  if (!(await verifyPassword(password, expected))) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
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
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
