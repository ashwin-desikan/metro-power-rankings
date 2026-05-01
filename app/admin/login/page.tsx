import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mission Control - Login",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/admin";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div
        className="w-full max-w-sm border rounded-lg p-8"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border)",
        }}
      >
        <p
          className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          MISSION CONTROL
        </p>
        <h1 className="text-2xl font-bold mb-6">Sign in</h1>

        <form method="POST" action="/api/admin/login" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="block text-sm text-[var(--text-muted)] mb-2">
              Password
            </span>
            <input
              type="password"
              name="password"
              autoFocus
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-md border bg-transparent focus:outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            />
          </label>

          {error ? (
            <p className="text-sm text-red-400">
              {error === "bad" ? "Wrong password." : "Login failed."}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full py-2 rounded-md font-semibold transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
