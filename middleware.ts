// Mission Control gate. Validates the mc_session cookie on /admin and
// /api/admin paths. Cookie value is sha256(password + ADMIN_SALT). The
// /admin/login page sets the cookie; /api/admin/logout clears it.
//
// We use Web Crypto (available in Edge runtime) so the same logic runs
// on Vercel Edge without a Node runtime override.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "mc_session";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page itself and the login API to pass through.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_SALT ?? "metro-mission-control";

  if (!password) {
    return new NextResponse(
      "ADMIN_PASSWORD not set on this deployment. Configure it in Vercel project settings, then redeploy.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  const expected = await sha256Hex(password + salt);
  const presented = req.cookies.get(COOKIE_NAME)?.value ?? "";

  if (!timingSafeEqual(expected, presented)) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

// Note: list "/admin" explicitly because the path-pattern "/admin/:path*"
// does not match the bare "/admin" route in Next.js matchers.
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
