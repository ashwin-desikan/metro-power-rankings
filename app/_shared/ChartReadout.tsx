"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The readout: the site's answer to "how does a phone read this chart".
//
// 🔴 A CHART THAT NEEDS A POINTER IS NOT FINISHED. Twenty-one chart
// components carried their facts in hover tooltips or `title` attributes,
// which a phone never shows, and the marks themselves (10px boxes, 9px
// labels) were below any readable floor (Ashwin, 2026-09-10: "how can
// anybody use these charts that have such small font?"). The pattern the
// good news graphics use is not a smaller tooltip, it is a READOUT: tap or
// drag anywhere on the chart and one line under it, in body size, says
// what you are on, and stays until you tap something else. Hover drives
// the same line on desktop, so both surfaces share one component and the
// chart never has to fit the words inside itself.
//
// Rules this carries (DESIGN-STANDARDS §8, added 2026-09-10):
// - 13px minimum for the readout text, 12px for any axis label on a phone.
// - The pointer surface is the whole chart, and selection is NEAREST mark,
//   so a 10px box is still a 44px target because the finger only has to be
//   closer to it than to its neighbour.
// - `aria-live="polite"`: a screen reader hears the readout change.
//
// Usage: wrap the chart in <ChartReadoutProvider>, call useChartReadout()
// from the mark handlers (set on click / pointermove / pointerenter, keep on
// leave so the last reading stays), and render <ChartReadout hint=.../>
// under the chart.

export type ReadoutItem = { key: string; text: string };

type Ctx = { item: ReadoutItem | null; set: (item: ReadoutItem | null) => void };
const ReadoutCtx = createContext<Ctx | null>(null);

export function ChartReadoutProvider({ children }: { children: ReactNode }) {
  const [item, set] = useState<ReadoutItem | null>(null);
  return <ReadoutCtx.Provider value={{ item, set }}>{children}</ReadoutCtx.Provider>;
}

export function useChartReadout(): Ctx {
  const c = useContext(ReadoutCtx);
  if (!c) throw new Error("useChartReadout needs a ChartReadoutProvider above it");
  return c;
}

export function ChartReadout({ hint, className = "" }: { hint: string; className?: string }) {
  const { item } = useChartReadout();
  return (
    <p
      aria-live="polite"
      className={`mt-2 min-h-[2.6rem] rounded-lg border px-3 py-2 text-[13px] leading-snug sm:text-sm ${className}`}
      style={{ background: "var(--bg-card)", borderColor: item ? "var(--accent)" : "var(--border)" }}
    >
      {item ? <span>{item.text}</span> : <span className="text-[var(--text-dim)]">{hint}</span>}
    </p>
  );
}
