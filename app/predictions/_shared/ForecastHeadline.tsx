import Link from "next/link";
import { MONO } from "@/app/business/ui";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";

// One-sentence forecast headline for a /predictions league hub, rendered
// directly above the hub's first board. Server-safe (no hooks): the hub
// pages already fetch sim + history data on the server, so this just takes
// the already-computed subject/pct/delta/spark and lays them out. See
// DESIGN-STANDARDS.md sec 2A: this is the "one clause above the board"
// idiom's headline cousin - the sentence a reader would say out loud.

export function ForecastHeadline({
  subject,
  href = null,
  logo = null,
  pctLabel,
  outcome,
  plural = false,
  delta = null,
  spark,
  context,
}: {
  /** Team/club/school name, already carrying "The " where the grammar wants it. */
  subject: string;
  href?: string | null;
  logo?: string | null;
  /** Already-formatted probability, e.g. "13%". */
  pctLabel: string;
  /** e.g. "to win Super Bowl LXI". */
  outcome: string;
  /** true for a plural nickname ("Bills have"), false for a singular club/school ("Arsenal has"). */
  plural?: boolean;
  /** Signed percentage-point change over 7 days; null renders no movement row. */
  delta?: number | null;
  /** Full history series for the sparkline; omit or <2 points renders nothing. */
  spark?: number[];
  /** One short MONO context line, e.g. sim count and field share. */
  context?: string;
}) {
  const verb = plural ? "have" : "has";
  const subjectNode = href ? (
    <Link href={href} className="hover:underline">
      {subject}
    </Link>
  ) : (
    subject
  );

  return (
    <section className="mb-8 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
      <p
        className="text-[10px] uppercase tracking-widest mb-2"
        style={{ ...MONO, color: "var(--text-dim)" }}
      >
        Live forecast
      </p>
      <p className="min-w-0 text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className="inline-block w-7 h-7 sm:w-8 sm:h-8 mr-2 align-middle object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span style={{ color: "var(--accent)" }}>{subjectNode}</span> {verb} a{" "}
        <span style={{ color: "var(--accent)" }}>{pctLabel}</span> chance {outcome}
      </p>
      {delta != null && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <Delta value={delta} unit="pp" />
          <span className="text-[11px]" style={{ ...MONO, color: "var(--text-dim)" }}>
            over 7 days
          </span>
          {spark && spark.length >= 2 && (
            <span style={{ color: "var(--accent)" }}>
              <Sparkline points={spark} />
            </span>
          )}
        </div>
      )}
      {context && (
        <p
          className="mt-3 text-[10px] uppercase tracking-widest"
          style={{ ...MONO, color: "var(--text-dim)" }}
        >
          {context}
        </p>
      )}
    </section>
  );
}
