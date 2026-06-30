// Admin auth gate.
//
// Every /admin page and /api/admin route requires a valid signed session
// cookie, except the login page and the login/logout endpoints. The gate
// fails CLOSED: if ADMIN_SESSION_SECRET is not configured, nothing under
// /admin is reachable.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

// Reachable without a session: the login screen, the login POST, and the
// logout POST (so an expired session can always be cleared).
const PUBLIC_PATHS = new Set<string>([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = secret ? await verifySession(token, secret) : false;
  if (ok) return NextResponse.next();

  // API routes get a clean 401; pages get bounced to login with a return path.
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
