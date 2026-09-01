"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FeedbackStatus } from "@/lib/feedback";

const ORDER: FeedbackStatus[] = ["new", "triaged", "fixed", "declined"];

const TONE: Record<FeedbackStatus, { bg: string; fg: string }> = {
  new: { bg: "rgba(123, 104, 238, 0.18)", fg: "#a89cf0" },
  triaged: { bg: "rgba(239, 159, 39, 0.18)", fg: "#EF9F27" },
  fixed: { bg: "rgba(78, 205, 196, 0.16)", fg: "#4ECDC4" },
  declined: { bg: "rgba(85, 85, 106, 0.2)", fg: "#8888A0" },
};

export default function StatusControls({ id, status }: { id: number; status: FeedbackStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<FeedbackStatus>(status);

  async function set(next: FeedbackStatus) {
    if (busy || next === current) return;
    setBusy(true);
    const prev = current;
    setCurrent(next); // optimistic; reverted below if the write fails
    try {
      const res = await fetch("/api/admin/feedback/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) setCurrent(prev);
      else router.refresh();
    } catch {
      setCurrent(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {ORDER.map((s) => {
        const on = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => set(s)}
            disabled={busy}
            aria-pressed={on}
            className="min-h-11 px-2.5 rounded-full border text-[11px] transition-colors disabled:opacity-50"
            style={
              on
                ? { background: TONE[s].bg, color: TONE[s].fg, borderColor: TONE[s].fg }
                : { background: "var(--bg-card)", color: "var(--text-dim)", borderColor: "var(--border)" }
            }
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
