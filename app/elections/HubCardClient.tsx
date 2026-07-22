"use client";

import { useState } from "react";
import Link from "next/link";

// Collapsible landing card for /elections. Collapsed by default: flag, name,
// headline link, and the Last/Next election lines. Clicking the card expands
// the description; clicking the headline navigates to the hub.

export type HubCardProps = {
  href: string;
  flagSrc: string;
  flagSrcSet: string;
  name: string;
  note?: string | null;
  noteTone?: "neutral" | null;
  head: string;
  body: string;
  last: string;
  next: string;
};

export default function HubCard(p: HubCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      className="rounded-xl border p-4 cursor-pointer select-none transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.flagSrc}
          srcSet={p.flagSrcSet}
          alt={`Flag of ${p.name}`}
          width={20}
          height={15}
          className="rounded-[2px] border shrink-0"
          style={{ borderColor: "var(--border)" }}
        />
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{p.name}</p>
        {p.note ? (
          <span
            className="text-[9px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 font-semibold shrink-0"
            style={p.noteTone === "neutral"
              ? { borderColor: "var(--border)", color: "var(--text-muted)" }
              : { borderColor: "#B4540A", color: "#D97706" }}
          >
            {p.note}
          </span>
        ) : null}
        <span
          aria-hidden
          className="ml-auto text-xs text-[var(--text-dim)] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▸
        </span>
      </div>
      <Link
        href={p.href}
        onClick={(e) => e.stopPropagation()}
        className="block text-lg font-bold text-[var(--text)] mt-1 hover:text-[var(--accent)]"
      >
        {p.head}
      </Link>
      {open ? <p className="text-sm text-[var(--text-muted)] mt-2">{p.body}</p> : null}
      <p className="text-xs text-[var(--text-dim)] mt-2">
        Last{" · "}
        <span className="text-[var(--text-muted)]">{p.last}</span>
      </p>
      <p className="text-xs text-[var(--text-dim)] mt-0.5">
        Next{" · "}
        <span className="text-[var(--text-muted)]">{p.next}</span>
      </p>
    </div>
  );
}
