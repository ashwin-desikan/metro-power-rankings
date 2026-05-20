"use client";

// Root-level error boundary. Catches uncaught render exceptions in any
// route and falls back to a navigable error page rather than the default
// Next bare error screen. SiteNav is still mounted by app/layout.tsx.
//
// Per the Next.js App Router contract, error.tsx must be a client
// component and receives the error plus a reset() callback for retry.

import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure to the console so dev builds remain debuggable.
    // In production this is silent unless the user opens devtools.
    if (typeof window !== "undefined") {
      console.error("[error.tsx] uncaught render error:", error);
    }
  }, [error]);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
      >
        Something broke
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
        We hit an unexpected error on that page.
      </h1>
      <p className="text-lg text-[var(--text-muted)] mb-2 max-w-xl">
        The most likely cause is a transient build, a recently-renamed slug,
        or a data file that did not refresh cleanly. Try again, or jump back
        to a known good entry point.
      </p>
      {error?.digest && (
        <p
          className="text-xs mb-8"
          style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          ref: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
          type="button"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          Rankings home
        </Link>
        <Link
          href="/updates"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          What is new
        </Link>
      </div>
    </main>
  );
}
