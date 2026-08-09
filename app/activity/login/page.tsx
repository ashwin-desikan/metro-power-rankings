import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Global Metro Power Rankings",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

// Deliberately low-key: no "restricted" or "admin" language, just a plain
// text field on an otherwise-empty page. A visitor without the phrase sees
// nothing that hints at what's behind it.
export default async function ActivityLoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/activity";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <form method="POST" action="/api/activity/login" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <input
              type="password"
              name="password"
              autoFocus
              autoComplete="current-password"
              placeholder="…"
              className="w-full px-3 py-2 rounded-md border bg-transparent text-center focus:outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--text-dim)] text-center">&nbsp;</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
