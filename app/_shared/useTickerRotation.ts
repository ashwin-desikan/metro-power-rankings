'use client';

import { useEffect, useState, type FocusEvent } from 'react';

// Shared motion rules for the homepage tickers (HeadlineTicker, OnTodayTicker), so the
// two can never drift apart (WCAG 2.2.2, DESIGN-STANDARDS §7):
//  - auto-advance every `intervalMs`, but hold still while the pointer or keyboard
//    focus is inside the ticker, so nobody loses an item mid-read;
//  - a pause/play toggle the caller renders as a visible control;
//  - prefers-reduced-motion never auto-advances (globals.css already zeroes the fade).
// The caller spreads `holdHandlers` onto its root element.

export function useTickerRotation(count: number, { intervalMs = 5000, startAt = 0 }: { intervalMs?: number; startAt?: number } = {}) {
  const [index, setIndex] = useState(startAt);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // A new item list (e.g. fetched after mount) re-anchors the position.
  useEffect(() => {
    setIndex(count > 0 ? Math.min(Math.max(startAt, 0), count - 1) : 0);
  }, [count, startAt]);

  const running = count > 1 && !paused && !holding && !reducedMotion;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setIndex((n) => (n + 1) % count), intervalMs);
    return () => window.clearInterval(id);
  }, [running, count, intervalMs]);

  const step = (d: number) => setIndex((n) => (count > 0 ? (n + d + count) % count : 0));

  const holdHandlers = {
    onMouseEnter: () => setHolding(true),
    onMouseLeave: () => setHolding(false),
    onFocus: () => setHolding(true),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHolding(false);
    },
  };

  return {
    index: count > 0 ? index % count : 0,
    step,
    paused,
    togglePaused: () => setPaused((p) => !p),
    reducedMotion,
    running,
    holdHandlers,
  };
}
