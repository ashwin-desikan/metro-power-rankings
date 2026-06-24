"use client";

import { useEffect, useState } from "react";

function dayKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

type St = { label: string; done: boolean };

const DAILIES: { title: string; href: string; key: (d: string) => string; parse: (s: Record<string, unknown>) => St }[] = [
  {
    title: "Metro Globle",
    href: "/play/metro-globle.html",
    key: (d) => `globle-${d}`,
    parse: (s) => {
      const n = Array.isArray(s.g) ? s.g.length : 0;
      return { label: s.done ? `${n}/6` : n ? `${n}/6…` : "Play", done: !!s.done };
    },
  },
  {
    title: "Metro Grid",
    href: "/play/metro-grid.html",
    key: (d) => `metrogrid-${d}`,
    parse: (s) => {
      const f = s.cells && typeof s.cells === "object" ? Object.keys(s.cells as object).length : 0;
      return { label: s.done ? `${f}/9` : f ? `${f}/9…` : "Play", done: !!s.done };
    },
  },
  {
    title: "Sports Grid",
    href: "/play/sports-grid.html",
    key: (d) => `sportsgrid-${d}`,
    parse: (s) => {
      const f = s.cells && typeof s.cells === "object" ? Object.keys(s.cells as object).length : 0;
      return { label: s.done ? `${f}/9` : f ? `${f}/9…` : "Play", done: !!s.done };
    },
  },
];

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function TodayStrip() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const d = dayKey();
  const items = DAILIES.map((g) => {
    let st: St = { label: "Play", done: false };
    try {
      const raw = localStorage.getItem(g.key(d));
      if (raw) st = g.parse(JSON.parse(raw) as Record<string, unknown>);
    } catch {}
    return { ...g, st };
  });
  const done = items.filter((i) => i.st.done).length;

  return (
    <section className="mb-8 rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-dim)", ...mono }}>
          Today&apos;s puzzles
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)", ...mono }}>{done}/3 solved</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <a
            key={i.href}
            href={i.href}
            className="rounded-lg border p-3 text-center transition hover:border-[var(--accent)]"
            style={{ background: "var(--bg)", borderColor: i.st.done ? "var(--accent)" : "var(--border)" }}
          >
            <div className="text-sm font-semibold">{i.title}</div>
            <div className="text-xs mt-1" style={{ color: i.st.done ? "var(--accent)" : "var(--text-muted)", ...mono }}>
              {i.st.done ? "✓ " : ""}
              {i.st.label}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
