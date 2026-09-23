// Shared admin session helpers.
//
// Pure Web Crypto (no Node-only APIs) so this module runs unchanged in the
// Edge middleware and in the Node route handlers. The session token is a
// signed, time-bounded value:  `${issuedAtSeconds}.${hmacSHA256}`. It is
// unforgeable without ADMIN_SESSION_SECRET, rotates whenever that secret
// changes, and expires after SESSION_TTL_SECONDS.

export const ADMIN_COOKIE = "mc_session";
// Separate cookie/credential pair from ADMIN_COOKIE on purpose: /activity is
// reachable by more people than Mission Control ever was (it's linked from
// the public-facing /updates page), and it has no write access, so it
// shouldn't share a password with the panel that does. Same signing/
// verification primitives below, just parameterized with a different
// secret and cookie name -- see app/api/activity/login/route.ts.
export const ACTIVITY_COOKIE = "activity_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison of two equal-length hex strings. Returns false
// on any length mismatch without leaking where the first difference is.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(buf);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return toHex(sig);
}

// Compare a candidate password to the expected value in constant time.
// Both sides are hashed first so the comparison length never depends on
// the secret's length.
export async function verifyPassword(
  candidate: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  return timingSafeEqual(a, b);
}

// Mint a fresh signed session token. Random per issuance via the timestamp;
// for higher entropy you can prepend a crypto.randomUUID() nonce to the
// signed message, but the HMAC already makes the token unforgeable.
export async function issueSession(secret: string): Promise<string> {
  const issued = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacHex(secret, issued);
  return `${issued}.${sig}`;
}

// Validate a session token: well-formed, signature matches, not expired.
export async function verifySession(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issued = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(issued)) return false;
  const issuedNum = parseInt(issued, 10);
  if (!Number.isFinite(issuedNum)) return false;
  const age = Math.floor(Date.now() / 1000) - issuedNum;
  if (age < 0 || age > SESSION_TTL_SECONDS) return false;
  const expected = await hmacHex(secret, issued);
  return timingSafeEqual(sig, expected);
}

// --- defence in depth for the /api/admin handlers ----------------------------
// proxy.ts already gates /admin and /api/admin, and it stays exactly as it is.
// This is the second lock: every handler checks for itself, so a matcher edit,
// a route moved outside the matched prefix, or any future path that proxy.ts
// does not see cannot silently expose a mutation. Measured 2026-09-23: NONE of
// the six handlers under app/api/admin verified anything, so the middleware was
// the only thing standing between an unauthenticated POST and a write.
//
// Typed structurally rather than against NextRequest on purpose: this file is
// imported by proxy.ts, which runs on the edge, and it has no framework imports
// today. A plain shape also means the unit test can call it with an object
// instead of standing up a Next request.
export type CookieBearing = {
  cookies: { get(name: string): { value: string } | undefined };
};

/** Null when the caller holds a valid admin session, otherwise a 401 to return.
 *  Fails CLOSED: a missing ADMIN_SESSION_SECRET denies rather than allows. */
export async function requireAdmin(req: CookieBearing): Promise<Response | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = secret ? await verifySession(token, secret) : false;
  return ok ? null : new Response("unauthorized", { status: 401 });
}
