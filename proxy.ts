// Mission Control gate (/admin) and the separate /activity gate. Both are
// signed-session-cookie checks using the same primitives from lib/adminAuth.ts,
// but with independent cookies and secrets -- ADMIN_COOKIE/ADMIN_SESSION_SECRET
// for /admin, ACTIVITY_COOKIE/ACTIVITY_SESSION_SECRET for /activity. Kept
// separate deliberately: /activity is linked from the public /updates page and
// has no write access, so it shouldn't share a password with the panel that
// does (queue add/delete/update).
//
// File convention in Next.js 16: proxy.ts with a default-exported `proxy`
// function (renamed from middleware). Runs on the Node runtime; the Web Crypto
// APIs used by lib/adminAuth still work there.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACTIVITY_COOKIE, ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";

// Reachable without a session: each gate's login screen, login POST, and
// logout POST (so an expired session can always be cleared).
const PUBLIC_PATHS = new Set<string>([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
  "/activity/login",
  "/api/activity/login",
  "/api/activity/logout",
]);

type Gate = { cookie: string; secretEnv: string; loginPath: string };

function gateFor(pathname: string): Gate | null {
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return { cookie: ADMIN_COOKIE, secretEnv: "ADMIN_SESSION_SECRET", loginPath: "/admin/login" };
  }
  if (pathname.startsWith("/activity") || pathname.startsWith("/api/activity")) {
    return { cookie: ACTIVITY_COOKIE, secretEnv: "ACTIVITY_SESSION_SECRET", loginPath: "/activity/login" };
  }
  return null;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const gate = gateFor(pathname);
  if (!gate) return NextResponse.next();

  const secret = process.env[gate.secretEnv];
  const token = req.cookies.get(gate.cookie)?.value;
  // Fail closed: with no secret configured, the gated path is unreachable.
  const ok = secret ? await verifySession(token, secret) : false;

  if (!ok) {
    // API routes get a clean 401; pages bounce to their gate's login with a
    // return path.
    if (pathname.startsWith("/api/")) {
      return new NextResponse("unauthorized", {
        status: 401,
        headers: { "content-type": "text/plain" },
      });
    }
    const url = req.nextUrl.clone();
    url.pathname = gate.loginPath;
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

// List "/admin" and "/activity" explicitly: the ":path*" pattern does not
// match the bare route in Next.js matchers.
export const config = {
  matcher: [
    "/admin", "/admin/:path*", "/api/admin/:path*",
    "/activity", "/activity/:path*", "/api/activity/:path*",
  ],
};
