"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import type { HistoryPayload } from "@/app/api/fans/history/route";
import TrendsClient from "./TrendsClient";

type Status = "checking" | "anon" | "fetching" | "ready" | "error";

// Same gate pattern as app/fans/FanGate.tsx: a signed-out or not-yet-
// resolved visitor sees a neutral skeleton then a sign-in card, nothing
// real reaches the browser before a verified session exists, and the full
// monthly history is only ever fetched client-side from the auth-gated
// app/api/fans/history/route.ts. There is no public preview here (unlike
// /fans's top 20): this whole page is behind sign-in.
export default function TrendsGate() {
  const [status, setStatus] = useState<Status>("checking");
  const [data, setData] = useState<HistoryPayload | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus("anon");
      return;
    }
    let mounted = true;

    async function load(token: string) {
      setStatus("fetching");
      try {
        const res = await fetch("/api/fans/history", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          if (mounted) setStatus("anon");
          return;
        }
        const json = (await res.json()) as HistoryPayload;
        if (mounted) {
          setData(json);
          setStatus("ready");
        }
      } catch {
        if (mounted) setStatus("error");
      }
    }

    sb.auth.getSession().then(({ data: sess }) => {
      if (!mounted) return;
      const token = sess.session?.access_token;
      if (token) load(token);
      else setStatus("anon");
    });

    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const token = session?.access_token;
      if (token) load(token);
      else {
        setData(null);
        setStatus("anon");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function signIn() {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  if (status === "ready" && data) {
    return <TrendsClient data={data} />;
  }

  if (status === "checking" || status === "fetching") {
    return (
      <div
        className="overflow-hidden rounded-xl border animate-pulse p-6"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        aria-hidden="true"
      >
        <div className="h-4 w-40 rounded mb-3" style={{ background: "var(--border)" }} />
        <div className="h-32 w-full rounded" style={{ background: "var(--border)" }} />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-5 sm:p-6 text-center"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold text-[var(--text)] mb-1.5">
        Sign in to see attention over time
      </h2>
      <p className="text-[13.5px] text-[var(--text-muted)] mb-4 max-w-md mx-auto">
        Compare teams, see the biggest movers within a league, and track whole leagues over time.
      </p>
      <button
        type="button"
        onClick={signIn}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full font-medium text-[14px] px-5 py-2.5 transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--accent)", color: "#08080D" }}
      >
        <span aria-hidden>G</span>
        Sign in with Google
      </button>
      <p className="text-[11.5px] text-[var(--text-dim)] mt-3">
        Free, no subscription. Takes a few seconds.
      </p>
      {status === "error" ? (
        <p className="text-[11.5px] mt-2" style={{ color: "var(--seq-4)" }}>
          Could not load attention history. Try signing in again.
        </p>
      ) : null}
    </div>
  );
}
