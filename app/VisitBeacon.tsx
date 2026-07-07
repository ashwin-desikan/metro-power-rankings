"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// First-party page counter. Posts the current path to our own /api/v route,
// which relays server-side to Supabase. Same-origin, so content blockers and
// privacy browsers don't drop it the way they drop a direct cross-origin call
// to a "track" endpoint. No query string, no PII. Silent no-op on any failure.
export default function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    try {
      fetch("/api/v", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname.slice(0, 512) }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* never let analytics break a page render */
    }
  }, [pathname]);
  return null;
}
