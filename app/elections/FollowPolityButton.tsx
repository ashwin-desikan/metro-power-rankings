"use client";

import { useFollowing } from "@/lib/useFollowing";

// Star toggle for a polity (hub), rendered inside HubTitle so every one of
// the 41 election hub pages gets it in the same commit that added it. Same
// idiom as app/FollowButton.tsx (metro/team), but its own small component:
// a hub title needs a plain icon-only star at a guaranteed 44px tap target
// (DESIGN-STANDARDS section 6), not the padded pill used inline in a card
// row. Initial render (server + first client paint) shows the empty/off
// state, so there is no hydration mismatch; the real state fills in after
// mount.
export default function FollowPolityButton({
  slug,
  name,
  href,
}: {
  slug: string;
  name: string;
  href: string;
}) {
  const { isFollowing, toggle } = useFollowing();
  const on = isFollowing("polity", slug);
  return (
    <button
      type="button"
      onClick={() => toggle({ type: "polity", slug, name, href })}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
      title={on ? `Unfollow ${name}` : `Follow ${name}`}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg transition-colors"
      style={
        on
          ? { background: "var(--accent)", color: "#08080D", borderColor: "var(--accent)" }
          : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
      }
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
    </button>
  );
}
