import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "mc_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safePathname(input: string | null | undefined): string {
  // Only allow same-origin internal redirects under /admin to avoid
  // open-redirect via the ?next= parameter.
  if (!input || typeof input !== "string") return "/admin";
  if (!input.startsWith("/admin")) return "/admin";
  return input;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safePathname(String(form.get("next") ?? "/admin"));

  const expected = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_SALT ?? "metro-mission-control";

  if (!expected) {
    return new NextResponse(
      "ADMIN_PASSWORD not set on this deployment.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  if (password !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("error", "bad");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const sessionValue = await sha256Hex(password + salt);

  const url = req.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
