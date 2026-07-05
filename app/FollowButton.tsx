"use client";

import { useFollowing, type FollowType } from "@/lib/useFollowing";

// Star toggle. Initial render (server + first client paint) shows "Follow" with
// an empty store, so there is no hydration mismatch; state fills in after mount.
export default function FollowButton({
  type,
  slug,
  name,
  href,
  size = "md",
}: {
  type: FollowType;
  slug: string;
  name: string;
  href: string;
  size?: "sm" | "md";
}) {
  const { isFollowing, toggle } = useFollowing();
  const on = isFollowing(type, slug);
  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-[13px]";
  return (
    <button
      type="button"
      onClick={() => toggle({ type, slug, name, href })}
      aria-pressed={on}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors ${pad}`}
      style={
        on
          ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" }
          : { background: "var(--bg-card)", color: "var(--text)", borderColor: "var(--border)" }
      }
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
      <span>{on ? "Following" : "Follow"}</span>
    </button>
  );
}
