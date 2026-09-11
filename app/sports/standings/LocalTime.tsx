"use client";

import { useEffect, useState } from "react";

/**
 * A fixture's kick-off, shown in the VIEWER's own time zone.
 *
 * Live Standings is a server component on ISR (`revalidate = 120`), so every
 * date on it was formatted on the server in a fixed zone -- UTC for most
 * blocks, Australia/Sydney for the AFL and NRL. That is correct for a DATE,
 * and wrong for a KICK-OFF: a 19:30 UTC match is 21:30 in Berlin and 15:30 in
 * New York, and the server cannot know which of those the reader wants. Only
 * the browser knows.
 *
 * 🔴 WHY THE FIRST RENDER IS DELIBERATELY THE SERVER'S UTC STRING. React
 * hydration compares the server HTML against the first client render; if this
 * formatted local time immediately, every fixture would mismatch and React
 * would discard and re-render the subtree, logging a hydration error. So the
 * first client render repeats `fallback` verbatim, and the local value is
 * applied in an effect, after hydration has matched. The visible cost is one
 * frame; the alternative is a console full of errors and a re-render of every
 * table on the page.
 *
 * It also degrades honestly. With JavaScript off the effect never runs and the
 * reader keeps the server's UTC string, which is labelled as UTC rather than
 * silently passed off as their local time.
 */
export default function LocalTime({
  iso,
  fallback,
  withTime = true,
  weekday = false,
}: {
  /** Full ISO timestamp for the fixture. */
  iso: string;
  /** What the server rendered; also the first client render, and the no-JS view. */
  fallback: string;
  /** False when the feed gives a date with no kick-off time (the rugby block). */
  withTime?: boolean;
  /** Lead with the day of the week ("FRI 11 Sept, 19:00"): the Today box, where
   *  a reader is placing a game in their week (Ashwin, 2026-09-11). */
  weekday?: boolean;
}) {
  const [label, setLabel] = useState(fallback);
  const [zone, setZone] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return; // unparseable: keep the server's string
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      const day = weekday ? `${d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase().replace(/\.$/, "")} ` : "";
      const date = `${day}${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
      if (!withTime) {
        setLabel(date);
        setZone(tz);
        return;
      }
      // Hour and minute only. Seconds are noise on a fixture list, and the
      // locale decides 24h vs am/pm rather than this component imposing one.
      const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setLabel(`${date}, ${time}`);
      setZone(tz);
    } catch {
      /* Intl unavailable: keep the server's string rather than guess */
    }
  }, [iso, withTime, weekday]);

  return (
    <time dateTime={iso} title={zone ? `${label} (${zone})` : `${fallback} UTC`}>
      {label}
    </time>
  );
}
