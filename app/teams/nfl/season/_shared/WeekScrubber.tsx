"use client";

import { createContext, useContext, useId, useState } from "react";
import type { ReactNode } from "react";

// The week scrubber for an NFL season hub: one piece of client state, "the
// season as it stood after week N", read by the weekly Elo chart and the
// standings table. Nothing is recomputed on a server and nothing is modelled:
// the season shard already stores, per team and per week, the rating, the
// rank, the cumulative record and the cumulative points, so "after week N"
// is a lookup, not a calculation. (Session prompt 2026-09-09, item C.)
//
// 🔴 CLIENT STATE, NOT A SEARCH PARAM, for the same reason SeasonStandings
// keeps its grouping in a useState: a searchParam read would make all 107
// season pages dynamic and drop them out of the static build.
//
// 🔴 A CONTEXT, NOT A WRAPPER COMPONENT. The chart and the standings sit in
// different sections of the page with server components between them
// (the towers, "what is left", the week-1 pricing), so the state has to
// cross server-rendered children. The provider takes those children as
// nodes, which the App Router allows; the consumers are the two client
// components that already exist. Without a provider, useThroughWeek()
// returns null and every consumer behaves exactly as before.

type Ctx = {
  week: number;
  setWeek: (w: number) => void;
  minWeek: number;
  maxWeek: number;
  /** Last regular-season week, when known, so the control can label it. */
  regEndWeek: number | null;
};

const WeekCtx = createContext<Ctx | null>(null);

export function WeekScrubberProvider({
  minWeek,
  maxWeek,
  regEndWeek = null,
  children,
}: {
  minWeek: number;
  maxWeek: number;
  regEndWeek?: number | null;
  children: ReactNode;
}) {
  const [week, setWeek] = useState(maxWeek);
  const clamp = (w: number) => Math.min(maxWeek, Math.max(minWeek, Math.round(w)));
  return (
    <WeekCtx.Provider value={{ week, setWeek: (w) => setWeek(clamp(w)), minWeek, maxWeek, regEndWeek }}>
      {children}
    </WeekCtx.Provider>
  );
}

/**
 * The week the reader has scrubbed to, or null when the page has no scrubber
 * (a seeded season, or a consumer rendered outside the provider). A consumer
 * treats null and maxWeek the same: the whole season.
 */
export function useThroughWeek(): number | null {
  const ctx = useContext(WeekCtx);
  if (!ctx) return null;
  return ctx.week >= ctx.maxWeek ? null : ctx.week;
}

export function useWeekScrubber(): Ctx | null {
  return useContext(WeekCtx);
}

const MONO = "'JetBrains Mono', monospace";

/**
 * The control. A native range input (the CountryTimeMachine idiom) with
 * step buttons either side and a "final" reset; every target clears 44px on
 * a phone. Announces the week for screen readers.
 */
export function WeekScrubberControl({ className = "" }: { className?: string }) {
  const ctx = useContext(WeekCtx);
  const id = useId();
  if (!ctx) return null;
  const { week, setWeek, minWeek, maxWeek, regEndWeek } = ctx;
  const atEnd = week >= maxWeek;
  const label =
    week === 0 ? "preseason seed"
      : regEndWeek && week > regEndWeek ? `playoffs, week ${week}`
      : `week ${week}`;
  const btn = "inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-md border text-xs";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label="Show the season through a week">
      <label htmlFor={`${id}-range`} className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
        Through
      </label>
      <button type="button" className={btn} onClick={() => setWeek(week - 1)} disabled={week <= minWeek}
        aria-label="One week earlier"
        style={{ borderColor: "var(--border)", color: week <= minWeek ? "var(--text-dim)" : "var(--text-muted)" }}>
        ◀
      </button>
      <input
        id={`${id}-range`}
        type="range"
        min={minWeek}
        max={maxWeek}
        step={1}
        value={week}
        onChange={(e) => setWeek(Number(e.target.value))}
        aria-valuetext={label}
        className="min-h-11 sm:min-h-8 w-40 sm:w-56 accent-[var(--accent)]"
      />
      <button type="button" className={btn} onClick={() => setWeek(week + 1)} disabled={atEnd}
        aria-label="One week later"
        style={{ borderColor: "var(--border)", color: atEnd ? "var(--text-dim)" : "var(--text-muted)" }}>
        ▶
      </button>
      <span className="text-xs tabular-nums" style={{ fontFamily: MONO, color: atEnd ? "var(--text-muted)" : "var(--accent)" }} aria-live="polite">
        {atEnd ? "full season" : label}
      </span>
      {!atEnd ? (
        <button type="button" className={`${btn} px-2`} onClick={() => setWeek(maxWeek)}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Final
        </button>
      ) : null}
    </div>
  );
}
