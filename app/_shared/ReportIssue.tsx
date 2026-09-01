"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

// Reader feedback control. Lives in the site footer, collapsed to a single
// button so it costs one line of height on every route (see SiteFooter for why
// that matters).
//
// Sign-in gated (Ashwin, 2026-09-01). The trade is deliberate: fewer reports,
// but every one of them carries a reply address, and the abuse surface is a
// Google account rather than an open text box. The button says so BEFORE it is
// pressed, so a reader who will not sign in does not compose a paragraph and
// then hit a wall.
//
// The access token is sent as a Bearer header and re-verified server-side in
// /api/feedback; nothing here is trusted to identify the user.

type Kind = "correction" | "coverage" | "idea" | "bug";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "correction", label: "Something is wrong", hint: "A number, date, name or crest that does not match the record" },
  { value: "coverage", label: "Something is missing", hint: "A league, club, metro or competition the site should track" },
  { value: "bug", label: "Something is broken", hint: "A page that fails, renders badly, or will not load" },
  { value: "idea", label: "An idea", hint: "Anything else you would like to see" },
];

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

export default function ReportIssue() {
  const pathname = usePathname();
  const sb = useMemo(() => getSupabase(), []);
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<Kind>("correction");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Same auth wiring as PicksClient: read the session once, then follow it.
  // First paint is always the signed-out shape, so there is no hydration
  // mismatch between the server render and the client's stored session.
  useEffect(() => {
    if (!sb) {
      setReady(true);
      return;
    }
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const signIn = useCallback(() => {
    if (!sb) return;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }, [sb]);

  const submit = useCallback(async () => {
    if (!sb || body.trim().length < 3) return;
    setState("sending");
    setError(null);
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setState("error");
      setError("Your session has expired. Sign in again.");
      return;
    }
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, path: pathname || "/", body }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setState("error");
        setError(json?.error || "Could not send that. Try again in a moment.");
        return;
      }
      setState("sent");
      setBody("");
    } catch {
      setState("error");
      setError("Could not send that. Check your connection and try again.");
    }
  }, [sb, body, kind, pathname]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-md border text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ ...cardStyle, color: "var(--text-muted)" }}
      >
        <span aria-hidden>✎</span>
        Spot an error? Tell us
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border p-3" style={cardStyle}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-semibold">Tell us what you found</p>
          <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
            About <span className="font-mono">{pathname || "/"}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setState("idle"); setError(null); }}
          className="min-h-11 px-3 text-xs rounded-md border transition-colors hover:border-[var(--accent)]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Close
        </button>
      </div>

      {/* aria-live so a screen reader hears the outcome, per DESIGN-STANDARDS §6. */}
      <p aria-live="polite" className="sr-only">
        {state === "sending" ? "Sending" : state === "sent" ? "Sent, thank you" : error ?? ""}
      </p>

      {state === "sent" ? (
        <div className="text-sm">
          <p>Thank you. That is now in the queue.</p>
          <p className="text-[11px] text-[var(--text-dim)] mt-1">
            Corrections usually ship with the next daily build. Fixes are listed on{" "}
            <a href="/updates" className="text-[var(--accent)] hover:underline">Updates</a>.
          </p>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="mt-2 min-h-11 px-3 text-xs rounded-md border transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Send another
          </button>
        </div>
      ) : !ready ? (
        <p className="text-xs text-[var(--text-dim)]">Loading…</p>
      ) : !signedIn ? (
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Reports are signed in, so we can reply to you and tell you when it is fixed. Same Google
            sign-in as Following and Picks.
          </p>
          <button
            type="button"
            onClick={signIn}
            disabled={!sb}
            className="min-h-11 px-4 rounded-md border text-sm font-medium transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Continue with Google
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                title={k.hint}
                aria-pressed={kind === k.value}
                className="min-h-11 px-3 rounded-full border text-xs transition-colors"
                style={
                  kind === k.value
                    ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" }
                    : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
                }
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-dim)]">
            {KINDS.find((k) => k.value === kind)?.hint}
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 4000))}
            rows={4}
            maxLength={4000}
            placeholder="What did you see, and what should it say instead?"
            className="w-full rounded-md border p-2"
            // 16px minimum, or iOS zooms the whole page on focus (§6).
            style={{ ...cardStyle, color: "var(--text)", fontSize: 16 }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-dim)] tabular-nums">
              {body.length}/4000
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={state === "sending" || body.trim().length < 3}
              className="min-h-11 px-4 rounded-md border text-sm font-medium transition-colors hover:border-[var(--accent)] disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
