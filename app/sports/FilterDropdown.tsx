"use client";

import { useEffect, useRef, useState } from "react";

// FilterDropdown — a labelled button that opens a popover panel below it.
// Used in the /sports map toolbar to hold the long facet rows (Country,
// League, etc.) so the controls stay compact and the map stays in view.
// Closes on outside click or Escape. The panel scrolls when tall.

export default function FilterDropdown({
  label,
  count = 0,
  widthClass = "w-72",
  children,
}: {
  label: string;
  count?: number;
  widthClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = count > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)]"
        style={{
          borderColor: active ? "var(--accent)" : "var(--border)",
          color: active ? "var(--accent)" : "var(--text)",
          background: "var(--bg-card)",
        }}
      >
        <span>{label}</span>
        {active && (
          <span
            className="rounded-full px-1.5 text-[9px] tabular-nums"
            style={{ background: "var(--accent-dim)", color: "var(--text)" }}
          >
            {count}
          </span>
        )}
        <span
          aria-hidden
          className="text-[var(--text-dim)] transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none", fontSize: "9px" }}
        >
          ▼
        </span>
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full mt-1 ${widthClass} rounded-lg border shadow-xl p-3 max-h-80 overflow-y-auto`}
          style={{ zIndex: 1000, background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
