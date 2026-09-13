import "server-only";
import Link from "next/link";
import { getAllMetros } from "@/lib/data";
import { getCountry } from "@/lib/countries";
import { LEAGUE_HUBS } from "@/lib/leagueHubs";
import { entityHref, type DigestEntity, type DigestItem, type DigestTopic } from "@/lib/digestFeed";
import { MONO, TabHeader } from "@/app/business/ui";
import { SourcesCard, plural } from "@/app/predictions/_shared/ui";
import { SectionHead } from "@/app/_shared/SectionHead";
import { Disclosure, ShowMore } from "@/app/_shared/Disclosure";

// Shared shell for /digest and /digest/[date], plus the story row reused by the
// homepage strip and the "In the news" sections on metro and country pages.
// Copied from the predictions/_shared idioms (crumbs, TabHeader stamp, SourcesCard)
// rather than hand-rolled. Server-only: place labels read public/data through
// lib/data and lib/countries, and the feed itself comes from lib/digestFeed.

export { MONO };

const SPOTIFY_SHOW = "https://open.spotify.com/show/033dcKWSbfDoQObNoPOwsZ";

/** "Sunday 13 September 2026" / "13 Sept 2026" / "Sun 13 Sept 2026". Dates are calendar days, so UTC noon. */
export function fmtDigestDate(day: string, style: "long" | "short" | "stamp" = "long"): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : style === "stamp"
        ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };
  return d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" }).replace(/,/g, "");
}

/** `Home / Digest / <day>`, the PredCrumbs idiom. */
export function DigestCrumbs({ day }: { day?: string }) {
  return (
    <nav className="text-xs text-[var(--text-muted)] mb-4">
      <Link href="/" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Home</Link>
      {" / "}
      {day ? (
        <>
          <Link href="/digest" className="inline-flex items-center min-h-[44px] -my-2 hover:underline">Digest</Link>
          {" / "}
          <span>{fmtDigestDate(day, "short")}</span>
        </>
      ) : (
        <span>Digest</span>
      )}
    </nav>
  );
}

let metroNames: Map<string, string> | null = null;

// League hub pages carry list-style titles ("NFL franchises"), so a chip pointing at a hub
// uses the hub's short name ("NFL") instead of the stored page title.
const HUB_SHORT = new Map(LEAGUE_HUBS.map((h) => [h.href, h.short]));

function entityLabel(e: DigestEntity): string | null {
  if (e.type === "metro") {
    metroNames ??= new Map([...getAllMetros()].map((m) => [m.slug, m.name]));
    return metroNames.get(e.slug) ?? null;
  }
  if (e.type === "country") return getCountry(e.slug)?.name ?? null;
  if (e.type === "club" || e.type === "league") {
    // No stored name means the writer never verified the page: no chip rather than a guess.
    return HUB_SHORT.get(`/teams/${e.slug}`) ?? e.name ?? null;
  }
  return null;
}

function EntityChips({ entities, omit }: { entities: DigestEntity[]; omit?: DigestEntity }) {
  const chips = entities
    .filter((e) => !(omit && e.type === omit.type && e.slug === omit.slug))
    .map((e) => ({ e, href: entityHref(e), label: entityLabel(e) }))
    // A tag with no route or no known name renders nothing rather than a dead chip.
    .filter((c): c is { e: DigestEntity; href: string; label: string } => Boolean(c.href && c.label));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map(({ e, href, label }) => (
        <Link
          key={`${e.type}-${e.slug}`}
          href={href}
          className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ ...MONO, color: "var(--text-muted)", borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Analytical tags. Deliberately NOT links and deliberately not chip-shaped: most have no
 * page, and a bordered pill reads as tappable. Plain dim mono text, separated by middots,
 * so the row's own tap target is unambiguous.
 */
function TopicLabels({ topics }: { topics: DigestTopic[] }) {
  if (!topics || topics.length === 0) return null;
  const seen = new Set<string>();
  const labels = topics
    .map((t) => t.label)
    .filter((l) => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
  if (labels.length === 0) return null;
  return (
    <p
      className="mt-1.5 text-[10px] uppercase tracking-widest"
      style={{ ...MONO, color: "var(--text-dim)" }}
    >
      {labels.join(" · ")}
    </p>
  );
}

/**
 * One story. The row is the tap target (tap-row + tap-target, DESIGN-STANDARDS §6):
 * the headline opens the publisher, place chips stay independently tappable.
 */
export function DigestItemRow({
  item,
  showNumber = false,
  showDate = false,
  omit,
}: {
  item: DigestItem;
  showNumber?: boolean;
  showDate?: boolean;
  omit?: DigestEntity;
}) {
  return (
    <li className="tap-row py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
      <p className="text-[11px] uppercase tracking-widest" style={{ ...MONO, color: "var(--text-muted)" }}>
        {showNumber ? <span style={{ color: "var(--accent)" }}>{String(item.position).padStart(2, "0")} · </span> : null}
        {item.sourceName}
        {showDate ? ` · ${fmtDigestDate(item.digestDate, "short")}` : ""}
      </p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-target mt-0.5 block text-base font-semibold leading-snug hover:text-[var(--accent)] transition-colors"
      >
        {item.headline}
        <span className="text-[var(--text-dim)] ml-1" aria-hidden>↗</span>
      </a>
      <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">{item.why}</p>
      <EntityChips entities={item.entities} omit={omit} />
      <TopicLabels topics={item.topics} />
    </li>
  );
}

/**
 * The "In the news" body for a metro or country page: newest first, dated, the
 * page's own place left off its chips. The page owns the section wrapper, so
 * each profile keeps its own Disclosure/Collapsible idiom and nav chip.
 */
export function InTheNewsList({ items, self }: { items: DigestItem[]; self: DigestEntity }) {
  return (
    <div className="max-w-3xl">
      {/* Bounded: lib/digestFeed caps entity queries at the limit the page passes (6). */}
      <ul data-mobile-uncapped="bounded: at most six stories">
        {items.map((it) => (
          <DigestItemRow key={`${it.digestDate}-${it.position}`} item={it} showDate omit={self} />
        ))}
      </ul>
      <Link href="/digest" className="inline-flex items-center min-h-11 mt-2 text-xs" style={{ ...MONO, color: "var(--accent)" }}>
        Every story in the latest digest →
      </Link>
    </div>
  );
}

export function DigestSources() {
  return (
    <SourcesCard title="Where these stories come from">
      <p>
        Each morning the Daily Newsletter Digest reads about fifty newsletters, groups them by theme and
        records an audio episode. These are the day&rsquo;s most substantive stories from it, each with a
        direct link to the original article.
      </p>
      <p>
        Links open the publisher&rsquo;s own site, which may ask you to subscribe. The one-line summaries are
        ours; the reporting is theirs. A place tag links to that metro or country on this site, where the same
        story appears under In the news.
      </p>
      <p>
        <a href={SPOTIFY_SHOW} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
          Listen to the audio edition on Spotify ↗
        </a>
      </p>
    </SourcesCard>
  );
}

export function DigestDayView({
  day,
  items,
  dates,
  isLatest,
}: {
  day: string;
  items: DigestItem[];
  dates: { date: string; count: number }[];
  isLatest: boolean;
}) {
  // A day can carry every story its post linked (up to 43), so the phone gets the first
  // PHONE_ROWS with the rest one tap away. ShowMore rather than CappedList: CappedList
  // places its <details> among the items, which is invalid inside an <ol>, so the tail is
  // a second <ol> continuing the numbering. Desktop renders every row (data-desktop-open).
  const PHONE_ROWS = 12;
  const head = items.slice(0, PHONE_ROWS);
  const tail = items.slice(PHONE_ROWS);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DigestCrumbs day={isLatest ? undefined : day} />
      <TabHeader
        emoji="📰"
        title="From the Digest"
        sub={DIGEST_SUB}
        stamp={`As of ${fmtDigestDate(day, "stamp")} · ${plural(items.length, "stories")} · Source: Daily Newsletter Digest`}
      />

      <section id="stories" className="mb-10">
        <SectionHead
          eyebrow={isLatest ? "Latest digest" : undefined}
          title={fmtDigestDate(day)}
          sub="In the digest's order. Headlines open the publisher's page; some are paywalled."
        />
        <div className="max-w-3xl">
          <ol>
            {head.map((it) => (
              <DigestItemRow key={it.position} item={it} showNumber />
            ))}
          </ol>
          {tail.length > 0 ? (
            <ShowMore label={`Show all ${items.length} stories`}>
              <ol start={PHONE_ROWS + 1}>
                {tail.map((it) => (
                  <DigestItemRow key={it.position} item={it} showNumber />
                ))}
              </ol>
            </ShowMore>
          ) : null}
        </div>
      </section>

      <DigestArchive dates={dates} current={day} />

      <DigestSources />
    </main>
  );
}

export const DIGEST_SUB =
  "Every story the day's newsletter digest linked, from about fifty newsletters, with one line on why each matters.";

const MONTH = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The archive: every digest day, grouped by month, newest first, under the day being read.
 * Each month is a Disclosure (open on desktop; on a phone only the newest month starts open),
 * so a year of archive is twelve headed rows on a phone rather than hundreds of chips.
 */
export function DigestArchive({ dates, current }: { dates: { date: string; count: number }[]; current: string }) {
  if (dates.length <= 1) return null;
  const months: { ym: string; days: { date: string; count: number }[] }[] = [];
  for (const d of dates) {
    const ym = d.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.ym === ym) last.days.push(d);
    else months.push({ ym, days: [d] });
  }
  const stories = dates.reduce((n, d) => n + d.count, 0);
  return (
    <section id="archive" className="mb-10">
      <SectionHead
        title="The archive"
        sub={`Every past digest, ${plural(dates.length, "days")} and ${stories.toLocaleString("en-GB")} stories. Pick a day to read it.`}
      />
      <div className="max-w-3xl space-y-3">
        {months.map((m, i) => (
          <Disclosure
            key={m.ym}
            defaultOpen={i === 0}
            title={<h3 className="text-base font-bold">{MONTH(m.ym)}</h3>}
            meta={`${plural(m.days.length, "days")} · ${m.days.reduce((n, d) => n + d.count, 0)} stories`}
          >
            <ul className="flex flex-wrap gap-2 p-3" data-mobile-uncapped="bounded: at most 31 days in a month, inside a collapsed month">
              {m.days.map((d) => {
                const here = d.date === current;
                return (
                  <li key={d.date}>
                    <Link
                      href={`/digest/${d.date}`}
                      aria-current={here ? "page" : undefined}
                      className="inline-flex items-center gap-2 min-h-11 rounded-lg border px-3 text-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{
                        borderColor: here ? "var(--accent)" : "var(--border)",
                        backgroundColor: "var(--bg-card)",
                        color: here ? "var(--accent)" : undefined,
                      }}
                    >
                      {fmtDigestDate(d.date, "short")}
                      <span className="text-[11px] text-[var(--text-dim)]" style={MONO}>{d.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        ))}
      </div>
    </section>
  );
}

export function EmptyDigest() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DigestCrumbs />
      <TabHeader
        emoji="📰"
        title="From the Digest"
        sub={DIGEST_SUB}
        stamp="No digest published yet · Source: Daily Newsletter Digest"
      />
      <p className="text-[var(--text-muted)] mb-10">The first digest lands here after the next morning run.</p>
      <DigestSources />
    </main>
  );
}
