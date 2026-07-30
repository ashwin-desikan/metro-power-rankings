import Link from "next/link";
import { getActivityFeed, type ActivityEntry } from "@/lib/activity";

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

// Compact "latest updates" strip for the home page. Reads the same activity feed
// as /activity and shows the most recent handful; full archive lives at /activity.
export default async function ActivityRail() {
  const feed = await getActivityFeed();
  const items: ActivityEntry[] = (feed?.entries ?? []).slice(0, 6);
  if (items.length === 0) return null;

  return (
    <section className="py-10 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between mb-4 gap-4">
          <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--accent)" }}>
            Latest updates
          </p>
          <Link
            href="/activity"
            className="text-[13px] whitespace-nowrap"
            style={{ ...MONO, color: "var(--accent)" }}
          >
            See all <span aria-hidden>→</span>
          </Link>
        </div>
        <ul className="space-y-2">
          {items.map((e, i) => (
            <li
              key={`${e.commit}-${i}`}
              className="flex gap-3 items-baseline text-[14px] text-[var(--text)]"
            >
              <time
                dateTime={e.date}
                className="flex-shrink-0 w-14 text-[12px] text-[var(--text-muted)]"
                style={MONO}
              >
                {shortDate(e.date)}
              </time>
              <span className="min-w-0">
                {e.hub && <span className="font-semibold">{e.hub}: </span>}
                <span className="text-[var(--text-muted)]">{e.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
