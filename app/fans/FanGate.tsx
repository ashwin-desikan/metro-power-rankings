"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabaseClient";
import { DataBar } from "@/app/_shared/DataBar";
import FanTable, { type FanTableTeam } from "./FanTable";
import { MONO } from "./_shared/ui";
import type { FanPreviewRow } from "@/lib/fanIndex";

type Status = "checking" | "anon" | "fetching" | "ready" | "error";

// Purely decorative placeholder rows for the blurred teaser below row 20.
// FAKE DATA, never a real team, league or score: the whole point of gating
// this page server-side is that nothing real reaches the browser before
// sign-in, and a blurred-but-real row would leak through page source or
// devtools regardless of the CSS blur. Do not replace these with a slice
// of the real ranking, even "just for rows 21-26".
const TEASER_ROWS = Array.from({ length: 6 }, (_, i) => ({
  rank: 21 + i,
  team: `Team ${String.fromCharCode(65 + i)}`,
  league: "League",
  score: Math.max(55, 90 - i * 6),
}));

// Neutral loading placeholder, shown instead of the preview while a session
// check (or the full-data fetch for an already-signed-in visitor) is in
// flight, so a signed-in visitor never sees the top-20 preview flash before
// the full table replaces it. animate-pulse is the site's existing
// loading-placeholder idiom (MetroMap.tsx, FootballIndexClient.tsx, etc).
function SkeletonRows() {
  return (
    <div
      className="overflow-hidden rounded-xl border animate-pulse"
      style={{ borderColor: "var(--border)" }}
      aria-hidden="true"
    >
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: 8 }, (_, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-3 w-10"><div className="h-3 w-4 rounded" style={{ background: "var(--border)" }} /></td>
              <td className="px-3 py-3"><div className="h-3 rounded" style={{ background: "var(--border)", width: `${60 - i * 3}%` }} /></td>
              <td className="px-3 py-3"><div className="h-3 w-16 rounded" style={{ background: "var(--border)" }} /></td>
              <td className="px-3 py-3 text-right"><div className="h-3 w-10 rounded ml-auto" style={{ background: "var(--border)" }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Server-rendered top-20 preview table. Was app/fans/page.tsx's own markup
// (a server component); moved here so ONE client component owns the whole
// table area (preview, skeleton, gate and full table together) and can
// hide the preview the instant a session is detected, instead of the
// preview living in a separate always-rendered server block with no way to
// react to client-side auth state. `rows` still comes from the server (via
// FansPage -> FanGate props), so the anonymous HTML is exactly as
// server-rendered as before.
function PreviewTable({ rows }: { rows: FanPreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm" data-sticky-col={2}>
        <thead>
          <tr className="text-left text-[var(--text-dim)] text-[11px] uppercase tracking-wide">
            <th className="px-3 py-2 w-10">#</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2">League</th>
            <th className="px-3 py-2 text-right">Cross-sport score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rank}-${r.name}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2 text-[var(--text-dim)] tabular-nums" style={MONO}>{r.rank}</td>
              <td className="px-3 py-2 font-medium">
                {r.href ? (
                  <Link href={r.href} className="hover:underline">{r.name}</Link>
                ) : (
                  r.name
                )}
              </td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{r.icon ? <span className="mr-1" aria-hidden>{r.icon}</span> : null}{r.league}</td>
              <td className="px-3 py-2 text-right">
                <DataBar v={r.score} dp={1} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Owns the whole /fans table area: the top-20 preview, the loading
// skeleton, the sign-in gate and (once signed in) the full table. A single
// component so a signed-in visitor's session can hide the preview and gate
// together the instant it is detected, rather than the preview (a separate
// always-rendered server block) having no way to react to that state.
//
// SSR/SEO: `previewRows` comes straight from the server (FansPage), so the
// preview table is always part of the initial HTML, for a crawler or a
// visitor with JS disabled. It is only ever HIDDEN (display: none, still in
// the DOM) while this component is checking for a session or fetching the
// full table for an already-signed-in visitor, and only fully REMOVED
// (the early return below) once "ready" -- a real, verified signed-in
// session with data in hand. Signing out reverses this: onAuthStateChange
// below clears `teams` and sets status back to "anon", which exits the
// "ready" branch and shows the preview + gate again.
export default function FanGate({ totalTeams, previewRows }: { totalTeams: number; previewRows: FanPreviewRow[] }) {
  const [status, setStatus] = useState<Status>("checking");
  const [teams, setTeams] = useState<FanTableTeam[] | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus("anon");
      return;
    }
    let mounted = true;

    async function loadFull(token: string) {
      setStatus("fetching");
      try {
        const res = await fetch("/api/fans", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          if (mounted) setStatus("anon");
          return;
        }
        const json = await res.json();
        if (mounted) {
          setTeams(json.teams as FanTableTeam[]);
          setStatus("ready");
        }
      } catch {
        if (mounted) setStatus("error");
      }
    }

    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const token = data.session?.access_token;
      if (token) loadFull(token);
      else setStatus("anon");
    });

    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const token = session?.access_token;
      if (token) loadFull(token);
      else {
        setTeams(null);
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

  // Signed in, data in hand: the preview and the gate are gone entirely,
  // not just hidden -- this is the ONLY thing a signed-in visitor sees.
  if (status === "ready" && teams) {
    return (
      <div className="mt-4">
        <FanTable teams={teams} />
        <p className="text-xs text-[var(--text-dim)] mt-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          &mdash; under Valued vs attention = not shown, either because the team has no published
          valuation or because that league&apos;s attention-to-value fit is too weak to be meaningful.
          &Dagger; = added to the index by a stated inclusion rule rather than by conference
          membership alone; hover the mark for the rule.
        </p>
      </div>
    );
  }

  // "checking" (session not resolved yet) and "fetching" (a verified
  // signed-in session, full data still in flight) both show the neutral
  // skeleton instead of the preview, so a signed-in visitor never sees the
  // top-20 flash before the full table lands. "anon" and "error" show the
  // preview (un-hidden) and the gate card.
  const loading = status === "checking" || status === "fetching";

  return (
    <div className="mt-2">
      <div style={loading ? { display: "none" } : undefined}>
        <PreviewTable rows={previewRows} />
      </div>
      {loading ? <SkeletonRows /> : null}

      {loading ? null : (
        <>
          <div
            className="relative overflow-hidden rounded-xl border mt-2"
            style={{ borderColor: "var(--border)" }}
            aria-hidden="true"
          >
            <table className="w-full text-sm" style={{ filter: "blur(3px)", opacity: 0.55 }}>
              <tbody>
                {TEASER_ROWS.map((r) => (
                  <tr key={r.rank} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 text-[var(--text-dim)]">{r.rank}</td>
                    <td className="px-3 py-2 font-medium">{r.team}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{r.league}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(to bottom, transparent, var(--bg) 85%)" }}
            />
          </div>

          <div
            className="mt-4 rounded-xl border p-5 sm:p-6 text-center"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <h2 className="text-base font-semibold text-[var(--text)] mb-1.5">
              Sign in to see all {totalTeams.toLocaleString()} teams
            </h2>
            <p className="text-[13.5px] text-[var(--text-muted)] mb-4 max-w-md mx-auto">
              Every league, every sport, and how attention compares with what teams are worth.
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
                Could not load the full index. Try signing in again.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
