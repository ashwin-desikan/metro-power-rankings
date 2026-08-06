"use client";

import Link from "next/link";
import { useFollowing } from "@/lib/useFollowing";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Homepage rail. Renders nothing until there is something to show, so it never
// flashes an empty box on first paint.
export default function FollowingRail() {
  const { items, ready } = useFollowing();
  if (!ready || items.length === 0) return null;
  return (
    <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>
          Following
        </p>
        {/* prefetch={false}: a "Manage" affordance next to the rail, rarely the
            thing the reader actually came for. Under Next 16's segment cache one
            prefetch costs four edge requests (_tree, _head, the segment,
            __PAGE__), so prefetching it is a poor trade. The chips below keep
            their prefetch: those are things the reader deliberately followed and
            is likely to click. */}
        <Link href="/me" prefetch={false} className="text-[11px]" style={{ ...MONO, color: "var(--accent)" }}>
          Manage <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 12).map((i) => (
          <Link
            key={`${i.type}:${i.slug}`}
            href={i.href}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-[var(--accent)]"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <span aria-hidden>{i.type === "metro" ? "🏙️" : "🏟️"}</span>
            <span>{i.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
