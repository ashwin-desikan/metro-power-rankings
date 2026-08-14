"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { NotableYear } from "@/lib/timeMachineYears";

// The year control for /time-machine.
//
// 🔴 THE SLIDER DOES NOT NAVIGATE WHILE YOU DRAG. The first version pushed a
// new URL on every `onChange`, and a range input fires that on every pixel of
// travel: dragging from 1900 to 1990 queued ninety server round-trips, and the
// thumb went dead under the cursor while they drained. Ashwin, 2026-08-14:
// "either delayed or non-responsive."
//
// So the thumb is driven by LOCAL state and the URL is written once, on
// release. The big year tracks the drag at 60fps because nothing is awaited;
// the board catches up when you let go. Everything else — chips, steppers — is
// a single deliberate action and commits immediately.
//
// `replace` rather than `push`, because a scrubber should not fill the back
// button with forty intermediate years. Back leaves the page, which is what
// someone who has been dragging actually wants.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function YearPicker({
  year,
  min,
  max,
  notable,
}: {
  year: number;
  min: number;
  max: number;
  notable: NotableYear[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // `draft` is what the reader sees; `year` is what the server has rendered.
  const [draft, setDraft] = useState(year);
  const [text, setText] = useState(String(year));

  useEffect(() => { setDraft(year); setText(String(year)); }, [year]);

  const commit = (y: number) => {
    const clamped = Math.min(max, Math.max(min, y));
    setDraft(clamped);
    setText(String(clamped));
    startTransition(() => router.replace(`/time-machine?year=${clamped}`, { scroll: false }));
  };

  const surprise = () => {
    const pool = notable.filter((n) => n.year !== year);
    commit((pool.length ? pool : notable)[Math.floor(Math.random() * (pool.length || notable.length))].year);
  };

  const Step = ({ label, to, title }: { label: string; to: number; title: string }) => (
    <button
      type="button" title={title} onClick={() => commit(to)}
      disabled={to === year}
      className="rounded-lg border px-2.5 py-2 text-[12px] font-semibold transition-colors hover:border-[var(--accent)] disabled:opacity-30"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", ...MONO }}
    >
      {label}
    </button>
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0">
          <label htmlFor="tm-year" className="block text-[10px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-dim)" }}>
            Year
          </label>
          <input
            id="tm-year"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => { const n = parseInt(text, 10); Number.isFinite(n) ? commit(n) : setText(String(year)); }}
            onKeyDown={(e) => { if (e.key === "Enter") { const n = parseInt(text, 10); if (Number.isFinite(n)) commit(n); } }}
            inputMode="numeric"
            aria-label="Year"
            className="w-[7rem] rounded-xl border px-3 py-2 text-3xl font-extrabold tabular-nums leading-none"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)", ...MONO }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          <Step label="−10" to={draft - 10} title="Ten years earlier" />
          <Step label="◀" to={draft - 1} title="A year earlier" />
          <Step label="▶" to={draft + 1} title="A year later" />
          <Step label="+10" to={draft + 10} title="Ten years later" />
          <button
            type="button" onClick={surprise}
            className="rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--accent)", background: "var(--bg-card)", color: "var(--accent)", ...MONO }}
          >
            🎲 Surprise me
          </button>
          <span
            aria-live="polite"
            className="text-[10px] transition-opacity"
            style={{ ...MONO, color: "var(--text-dim)", opacity: pending ? 1 : 0 }}
          >
            loading…
          </span>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={draft}
        // The big year box tracks the drag too. Without this the only thing
        // that moved while dragging was the thumb itself, so the control gave
        // no numeric feedback until release — which reads as the same lag the
        // navigation-per-tick bug caused, for a different reason.
        onChange={(e) => { const v = parseInt(e.target.value, 10); setDraft(v); setText(String(v)); }}
        // Commit on RELEASE, in every input modality. Pointer covers mouse and
        // most touch; touchEnd is the Safari fallback; keyUp covers the arrow
        // keys, which move the thumb without ever firing a pointer event.
        onPointerUp={() => commit(draft)}
        onTouchEnd={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        aria-label="Drag to change year"
        className="w-full mt-4 accent-[var(--accent)] cursor-pointer"
      />
      <div className="flex justify-between text-[10px] mt-0.5" style={{ ...MONO, color: "var(--text-dim)" }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-dim)" }}>
          Jump to a year worth seeing
        </div>
        <div className="flex flex-wrap gap-1.5">
          {notable.map((n) => {
            const on = n.year === year;
            return (
              <button
                key={n.year}
                type="button"
                onClick={() => commit(n.year)}
                title={n.why}
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors hover:border-[var(--accent)]"
                style={{
                  ...MONO,
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  background: on ? "var(--accent)" : "var(--bg-card)",
                  color: on ? "#08080D" : "var(--text-muted)",
                }}
              >
                {n.year}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
