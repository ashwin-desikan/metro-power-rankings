"use client";

import { useMemo, useState } from "react";
import type { ScheduledJob, JobCadence } from "@/lib/refreshSchedule";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CADENCE_DOT: Record<JobCadence, string> = {
  monthly: "#F7B955",
  weekly: "#4ECDC4",
  daily: "#55556A",
};

type DayJob = {
  job: ScheduledJob;
  localTimes: string[];
};

function isoWeekday(d: Date): number {
  const day = d.getDay(); // 0=Sun..6=Sat
  return day === 0 ? 7 : day;
}

function jobsOnDate(jobs: ScheduledJob[], d: Date): DayJob[] {
  const month = d.getMonth() + 1;
  const dom = d.getDate();
  const wd = isoWeekday(d);
  const out: DayJob[] = [];
  for (const job of jobs) {
    if (job.months.length && !job.months.includes(month)) continue;
    if (job.weekdays.length && !job.weekdays.includes(wd)) continue;
    if (job.days_of_month.length && !job.days_of_month.includes(dom)) continue;
    const localTimes = job.times.map((t) => {
      const [hh, mm] = t.split(":").map(Number);
      const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm));
      return utc.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    });
    out.push({ job, localTimes });
  }
  out.sort((a, b) => {
    const order: Record<JobCadence, number> = { monthly: 0, weekly: 1, daily: 2 };
    return order[a.job.cadence] - order[b.job.cadence] || a.job.label.localeCompare(b.job.label);
  });
  return out;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function buildGrid(year: number, month: number): (Date | null)[][] {
  const first = startOfMonth(year, month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadBlanks = isoWeekday(first) - 1; // Monday-start
  const cells: (Date | null)[] = Array(leadBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ScheduleCalendar({ jobs }: { jobs: ScheduledJob[] }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(today);

  const weeks = useMemo(
    () => buildGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const selectedJobs = selected ? jobsOnDate(jobs, selected) : [];

  const goMonth = (delta: number) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[var(--text)]">
            {MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="flex items-center gap-2" style={MONO}>
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="rounded border px-2.5 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              &larr;
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded border px-2.5 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              Today
            </button>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="rounded border px-2.5 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              &rarr;
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3 text-[11px] text-[var(--text-muted)]" style={MONO}>
          {(["monthly", "weekly", "daily"] as JobCadence[]).map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: CADENCE_DOT[c] }}
              />
              {c}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="text-center text-[10px] uppercase tracking-widest py-2 text-[var(--text-dim)]"
              style={{ ...MONO, backgroundColor: "var(--bg-card)" }}
            >
              {w}
            </div>
          ))}
          {weeks.map((week, wi) =>
            week.map((d, di) => {
              if (!d) {
                return (
                  <div
                    key={`${wi}-${di}`}
                    style={{ backgroundColor: "var(--bg)" }}
                  />
                );
              }
              const dayJobs = jobsOnDate(jobs, d);
              const isToday = isSameDay(d, today);
              const isSelected = selected && isSameDay(d, selected);
              return (
                <button
                  key={`${wi}-${di}`}
                  onClick={() => setSelected(d)}
                  className="text-left p-1.5 min-h-[92px] flex flex-col gap-1 transition-colors"
                  style={{
                    backgroundColor: isSelected ? "var(--bg-card-hover)" : "var(--bg-card)",
                    outline: isSelected ? "1px solid var(--accent)" : isToday ? "1px solid var(--accent-dim)" : "none",
                    outlineOffset: "-1px",
                  }}
                >
                  <span
                    className="text-xs"
                    style={{ ...MONO, color: isToday ? "var(--accent)" : "var(--text-muted)" }}
                  >
                    {d.getDate()}
                  </span>

                  {/* Mobile: dots only, no truncated text -- tap the day and
                      read the sidebar instead. A 7-column grid on a phone
                      leaves no room for readable labels. */}
                  <div className="sm:hidden flex-1 flex flex-wrap content-start gap-1">
                    {dayJobs.map((dj) => (
                      <span
                        key={dj.job.id}
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: CADENCE_DOT[dj.job.cadence] }}
                      />
                    ))}
                  </div>

                  {/* sm+: full dot + label list, as space allows. */}
                  <div className="hidden sm:block flex-1 overflow-y-auto max-h-[60px] space-y-0.5">
                    {dayJobs.slice(0, 6).map((dj) => (
                      <div key={dj.job.id} className="flex items-center gap-1">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CADENCE_DOT[dj.job.cadence] }}
                        />
                        <span className="text-[10px] leading-tight truncate text-[var(--text-muted)]">
                          {dj.job.label}
                        </span>
                      </div>
                    ))}
                    {dayJobs.length > 6 && (
                      <div className="text-[10px] text-[var(--text-dim)]" style={MONO}>
                        +{dayJobs.length - 6} more
                      </div>
                    )}
                  </div>
                </button>
              );
            }),
          )}
        </div>
      </div>

      <aside>
        <div
          className="rounded-xl border p-4 sticky top-8"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-1" style={MONO}>
            {selected
              ? selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : "Select a day"}
          </p>
          {selectedJobs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] mt-2">Nothing scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {selectedJobs.map((dj) => (
                <li key={dj.job.id} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: CADENCE_DOT[dj.job.cadence] }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)]">{dj.job.label}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5" style={MONO}>
                        {dj.localTimes.join(", ")} local &middot; {dj.job.schedule_text}
                      </p>
                      {dj.job.last_run.date && (
                        <p className="text-[11px] text-[var(--text-dim)] mt-1">
                          last ran {dj.job.last_run.date}
                          {dj.job.last_run.status ? ` (${dj.job.last_run.status})` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
