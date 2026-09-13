import "server-only";
import { adtechEvents, sportEvents, type DigestEvent } from "@/lib/digestEvents";

// The two industry calendars, in a column beside the stories.
//
// Ashwin, 2026-09-13: "the events, both the Summitly and the Digital Voice events, belong
// in another column, maybe on the right-hand side of the page." They were columns of the
// top card until now; they are reference material a reader dips into, not the thing the
// page is about, so the side is the right home for them.
//
// Both lists are short on purpose and both credit their source. Summitly carries 450+
// events and The Digital Voice's sheet 428, which is the investment UK database right
// protects: the facts are free, the compilation is not. Credit and link out, never import.
// lib/digestEvents holds the lists and the reasoning.

function EventList({ events }: { events: DigestEvent[] }) {
  if (events.length === 0) {
    return <p className="m-0 text-xs text-[var(--text-dim)]">Nothing dated yet.</p>;
  }
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {events.map((e, i) => (
        <li key={`${e.label}-${i}`} className="text-xs leading-snug">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">{e.label}</span>
            <span className="flex-shrink-0 tabular-nums text-[10px] text-[var(--text-muted)]">{e.whenLabel}</span>
          </div>
          {e.detail && <div className="text-[10px] text-[var(--text-dim)]">{e.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

function Card({
  title, events, creditText, creditHref,
}: { title: string; events: DigestEvent[]; creditText: string; creditHref: string }) {
  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <h2 className="m-0 text-xs font-semibold">{title}</h2>
      </div>
      <div className="px-3 py-2.5">
        <EventList events={events} />
        {/* Not decoration. The list is a handful of rows from someone else's verified
            compilation, carried by brevity rather than by licence. The link is the point. */}
        <div className="mt-2 text-[10px] text-[var(--text-dim)]">
          <a
            href={creditHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--accent)]"
          >
            {creditText} ↗
          </a>
        </div>
      </div>
    </section>
  );
}

export default function EventsColumn() {
  return (
    <aside className="space-y-3" aria-label="Industry events">
      <Card
        title="Sports industry events"
        events={sportEvents()}
        creditText="Collated by Summitly"
        creditHref="https://summitly.events/"
      />
      <Card
        title="AdTech and media events"
        events={adtechEvents()}
        creditText="Collated by The Digital Voice"
        creditHref="https://docs.google.com/spreadsheets/d/1mIKFOVtZRsmGhSNejzR_sXhR3o5rmUxuda07Pce_AFE/htmlview"
      />
    </aside>
  );
}
