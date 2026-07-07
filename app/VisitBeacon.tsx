"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// First-party page counter. Writes the current path straight to Supabase's
// track_visit RPC from the browser. We tried a same-origin /api/v relay to
// dodge content blockers, but a Vercel route handler's server-side fetch to
// Supabase never landed (confirmed: zero server-origin calls in Supabase's
// API log), whereas the direct browser call is proven to write. These are the
// PUBLIC anon URL + key (already inlined in the client bundle), with hardcoded
// fallbacks so a missing NEXT_PUBLIC at build can't silently disable it.
const SB_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://nmprqkmymrdknffwnuur.supabase.co";
const SB_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

export default function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    try {
      fetch(`${SB_URL}/rest/v1/rpc/track_visit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
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
