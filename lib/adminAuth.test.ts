import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireAdmin, issueSession, ADMIN_COOKIE } from "./adminAuth";

// Step 3 of the 2026-09-23 hardening: the /api/admin handlers verify for
// themselves instead of trusting proxy.ts alone. Before this, none of the six
// handlers checked anything, so the middleware was the only lock on an
// unauthenticated write.
//
// requireAdmin is typed structurally, so a plain object stands in for the
// request and no Next machinery is needed here.
const reqWith = (cookie?: string) => ({
  cookies: {
    get: (name: string) =>
      cookie !== undefined && name === ADMIN_COOKIE ? { value: cookie } : undefined,
  },
});

const SECRET = "test-secret-not-a-real-one";

describe("requireAdmin", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = saved;
  });

  it("returns 401 when there is no cookie at all", async () => {
    const denied = await requireAdmin(reqWith());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it("returns 401 for a junk cookie", async () => {
    const denied = await requireAdmin(reqWith("not-a-token"));
    expect(denied?.status).toBe(401);
  });

  it("returns 401 for a token signed with a different secret", async () => {
    const foreign = await issueSession("some-other-secret");
    const denied = await requireAdmin(reqWith(foreign));
    expect(denied?.status).toBe(401);
  });

  it("lets a valid session through", async () => {
    const token = await issueSession(SECRET);
    expect(await requireAdmin(reqWith(token))).toBeNull();
  });

  // The most important case: a deployment that forgets the secret must DENY,
  // not sail through. A guard that fails open is worse than no guard, because
  // it reads as protection in review.
  it("fails CLOSED when ADMIN_SESSION_SECRET is unset", async () => {
    const token = await issueSession(SECRET);
    delete process.env.ADMIN_SESSION_SECRET;
    const denied = await requireAdmin(reqWith(token));
    expect(denied?.status).toBe(401);
  });
});
