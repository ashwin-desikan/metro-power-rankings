import Link from "next/link";
import { getActivityFeed, type ActivityEntry } from "@/lib/activity";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

// Compact activity preview pane for /updates. Shows the newest handful of
// activity-feed entries (the granular per-commit changes) alongside the
// curated release notes, with a link to the full /activity archive.
export default async function ActivityPreview() {
  const feed = await getActivityFeed();
  const items: ActivityEntry[] = (feed?.entries ?? []).slice(0, 8);
  if (items.length === 0) return null;

  return (
    <section
      className="mb-12 rounded-xl border p-5 sm:p-6"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--accent)" }}>
          Recent activity
        </p>
        <Link href="/activity" className="text-[13px] whitespace-nowrap" style={{ ...MONO, color: "var(--accent)" }}>
          See full activity <span aria-hidden>&rarr;</span>
        </Link>
      </div>
      <p className="text-[13px] text-[var(--text-muted)] mb-4">
        The granular, per-change log behind the release notes below.
      </p>
      <ul className="space-y-2">
        {items.map((e, i) => (
          <li key={`${e.commit}-${i}`} className="flex gap-3 items-baseline text-[14px] text-[var(--text)]">
            <time dateTime={e.date} className="flex-shrink-0 w-14 text-[12px] text-[var(--text-muted)]" style={MONO}>
              {shortDate(e.date)}
            </time>
            <span className="min-w-0">
              {e.hub && <span className="font-semibold">{e.hub}: </span>}
              <span className="text-[var(--text-muted)]">{e.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
