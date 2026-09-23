// The one place that decides which header to trust for a caller's IP.
//
// 🔴 x-forwarded-for IS A CLIENT-APPENDABLE LIST, AND TAKING [0] IS THE BUG.
// It is a hop chain, and a client can PREPEND whatever it likes, so the first
// entry is attacker-controlled. The last entry is the one the edge itself
// added. x-real-ip is set once by the edge and cannot be appended to, so it is
// the trustworthy value when present.
//
// This logic was already correct in app/api/admin/login/route.ts and wrong
// everywhere else: on 2026-09-23 app/api/banter/route.ts keyed its rate limit
// on `x-forwarded-for.split(",")[0]`, which any caller could rotate at will to
// get a fresh bucket per request, and that limiter was the only thing standing
// between an anonymous caller and paid inference. Lifted here so there is one
// implementation to be right rather than three to drift.
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}
