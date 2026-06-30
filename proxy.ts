// Mission Control gate. Requires a valid signed session cookie on /admin and
// /api/admin paths. The signed-token scheme and verification helpers live in
// lib/adminAuth.ts; the /admin/login page (via /api/admin/login) mints the
// cookie and /api/admin/logout clears it.
//
// File convention in Next.js 16: proxy.ts with a default-exported `proxy`
// function (renamed from middleware). Runs on the Node runtime; the Web Crypto
// APIs used by lib/adminAuth still work there.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";

// Reachable without a session: the login screen, the login POST, and the
// logout POST (so an expired session can always be cleared).
const PUBLIC_PATHS = new Set<string>([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
]);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  // Fail closed: with no secret configured, nothing under /admin is reachable.
  const ok = secret ? await verifySession(token, secret) : false;

  if (!ok) {
    // API routes get a clean 401; pages bounce to login with a return path.
    if (pathname.startsWith("/api/")) {
      return new NextResponse("unauthorized", {
        status: 401,
        headers: { "content-type": "text/plain" },
      });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

// List "/admin" explicitly: the "/admin/:path*" pattern does not match the
// bare "/admin" route in Next.js matchers.
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
