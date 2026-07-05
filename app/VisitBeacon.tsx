"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// First-party, privacy-light page counter. Fires the Supabase `track_visit`
// RPC with the current path only (no query string, no PII). Silent no-op if the
// public env vars are absent, so the site never breaks on a missing key.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!URL || !KEY || !pathname) return;
    try {
      fetch(`${URL}/rest/v1/rpc/track_visit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({ p_path: pathname.slice(0, 512) }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* never let analytics break a page render */
    }
  }, [pathname]);
  return null;
}
