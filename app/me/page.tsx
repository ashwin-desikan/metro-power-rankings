"use client";

import Link from "next/link";
import { useFollowing, type FollowItem } from "@/lib/useFollowing";

function Section({
  title,
  emoji,
  items,
  onRemove,
}: {
  title: string;
  emoji: string;
  items: FollowItem[];
  onRemove: (type: FollowItem["type"], slug: string) => void;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        {emoji} {title} <span className="text-[var(--text-dim)]">({items.length})</span>
      </h2>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {items.map((i) => (
          <div
            key={`${i.type}:${i.slug}`}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <Link href={i.href} className="text-[14px] font-medium truncate hover:text-[var(--accent)]">
              {i.name}
            </Link>
            <button
              type="button"
              onClick={() => onRemove(i.type, i.slug)}
              title={`Unfollow ${i.name}`}
              aria-label={`Unfollow ${i.name}`}
              className="shrink-0 text-[var(--text-dim)] hover:text-[var(--text)] text-sm leading-none px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MePage() {
  const { items, ready, remove } = useFollowing();
  const metros = items.filter((i) => i.type === "metro");
  const teams = items.filter((i) => i.type === "team");

  return (
    <div style={{ backgroundColor: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-20 pb-16">
        <h1 className="text-3xl font-bold mb-2">Following</h1>
        <p className="text-[15px] text-[var(--text-muted)] mb-8 max-w-xl">
          Metros and teams you follow, saved in this browser. Nothing leaves your device, and there is
          no account.
        </p>

        {ready && items.length === 0 && (
          <div className="rounded-lg border p-6 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
            You aren&rsquo;t following anything yet. Open a{" "}
            <Link href="/rankings" className="text-[var(--accent)]">metro</Link> or a{" "}
            <Link href="/teams/national" className="text-[var(--accent)]">national team</Link> and tap Follow.
          </div>
        )}

        {metros.length > 0 && <Section title="Metros" emoji="🏙️" items={metros} onRemove={remove} />}
        {teams.length > 0 && <Section title="Teams" emoji="🏟️" items={teams} onRemove={remove} />}
      </div>
    </div>
  );
}
