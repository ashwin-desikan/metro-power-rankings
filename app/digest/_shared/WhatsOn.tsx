import "server-only";
import Link from "next/link";
import { seasonSnapshot, type SeasonEntry } from "@/lib/digestSeason";
import { politicsEvents } from "@/lib/digestEvents";
import { flagUrlByCode } from "@/lib/flags";

// "What's on", the top of the digest.
//
// Ashwin, 2026-09-13: "It's more like what sports are in season, which ones are in the
// playoffs, and which ones are coming towards the end of the year ... that's what the
// stories will tend to be about, rather than the individual games happening today."
//
// SPLIT TO MATCH THE TOP NAV, at his request the same day: "it should be part of the
// sports area, and then there should be a politics/geography area ... mirroring the menus
// we have on the top, because it's confusing." The site nav reads Geography, Sports,
// Culture, Business, and /elections lives under Geography, so these two panels are named
// Sports and Geography and each owns its own onward links. Before this the "Today's games
// and tables" link sat in the card header, above the elections column, and so read as
// though it belonged to the elections.

/** An onward link with a line saying what is actually on the other end of it. */
type PanelLink = { label: string; hint: string; href: string };

function Chevron() {
  return (
    <svg
      className="details-chevron h-4 w-4 flex-shrink-0 transition-transform"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// ONE <details> AROUND BOTH PANELS, not one each.
//
// Ashwin, 2026-09-13: "if I click on Sports, then it expands, but the Geography one stays
// empty, and vice versa. Can you just have it so that if somebody clicks, they both
// expand?" Two sibling <details> are two independent toggles, and a reader who opened one
// was left staring at a half-filled row. The collapsible is therefore the WRAPPER
// (Collapsible below); Panel is a plain card again and carries no toggle of its own.
//
// Note for anyone tempted by the platform's own grouping: `name` on <details> makes an
// EXCLUSIVE accordion, so giving both the same name would close Sports when Geography
// opened, which is the bug inverted rather than fixed.
function Panel({
  title, href, links, children,
}: {
  title: string;
  href: string;
  links?: PanelLink[];
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      aria-label={title}
    >
      <div className="border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
        <h3 className="m-0 text-sm font-semibold">
          <Link href={href} className="hover:text-[var(--accent)]">{title}</Link>
        </h3>
      </div>
      <div className="px-3 py-3">{children}</div>
      {/* The onward links sit at the FOOT, one per line with a description.
          Ashwin, 2026-09-13, on the old header link: "I don't like this description ...
          The page contains live standings, playoff odds, and today games/recent/upcoming.
          Come up with a better description." A bare "Today's games and tables" both
          undersold the page and, sitting in the header, read as a label for the card
          rather than a link off it. */}
      {links && links.length > 0 && (
        <div className="mt-auto border-t px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {links.map((l) => (
              <li key={l.href + l.label} className="text-[11px] leading-snug">
                <Link href={l.href} className="font-medium text-[var(--accent)] hover:underline">
                  {l.label} →
                </Link>
                <span className="ml-1 text-[var(--text-dim)]">{l.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The single toggle, closed on every viewport.
 *
 * Ashwin, 2026-09-13: "make the sports and geography stuff at the top collapsible by
 * default ... I just think it's too big, both on desktop and mobile, to be open right at
 * the beginning." Deliberately NOT <Disclosure>: that defaults `desktopOpen` to true, and
 * globals.css then force-reveals a marked <details> above 640px whatever `open` says — the
 * exact trap that left the digest archive wide open on the desktop earlier today. A plain
 * <details> with no `data-desktop-open` stays shut everywhere.
 *
 * The summary carries a LIVE tease, one line per panel, because the other half of the ask
 * was "indicate the usefulness of the stuff inside so that people will not just skip over
 * it but will intend to click on it." A bare "What's on ▾" is a header, not an invitation;
 * real counts and the nearest dated election tell the reader what opening it buys them.
 */
function Collapsible({
  sportsTease, geographyTease, children,
}: {
  sportsTease: string;
  geographyTease: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className="mb-4 overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <summary
        className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 px-4 py-2.5
                   transition-colors hover:bg-[var(--bg-card-hover)] [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0">
          <h2 className="m-0 text-sm font-semibold">What&rsquo;s on</h2>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
            <span className="block">
              <span className="font-medium text-[var(--text)]">Sports</span> {sportsTease}
            </span>
            <span className="block">
              <span className="font-medium text-[var(--text)]">Geography</span> {geographyTease}
            </span>
          </span>
        </span>
        <Chevron />
      </summary>
      {/* Both panels live inside the one reveal, so a single click fills the whole row. */}
      <div
        className="grid grid-cols-1 gap-3 border-t p-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        style={{ borderColor: "var(--border)" }}
      >
        {children}
      </div>
    </details>
  );
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

/** A competition with a hub links; one without renders as plain text, never a dead link. */
function Name({ e }: { e: SeasonEntry }) {
  if (!e.href) return <span>{e.label}</span>;
  return <Link href={e.href} className="hover:text-[var(--accent)]">{e.label}</Link>;
}

function EntryRow({ e, live, showGroup = false }: { e: SeasonEntry; live: boolean; showGroup?: boolean }) {
  return (
    <li className="flex items-baseline gap-1.5 text-xs">
      <span aria-hidden className="flex-shrink-0 text-[11px] leading-none">{e.icon}</span>
      <span className="min-w-0 truncate">
        <Name e={e} />
        {/* Ashwin, 2026-09-13: "please put the sport that those are associated with, maybe
            in smaller font so that it doesn't take away from the name itself." Only on
            the two mixed-sport buckets; the in-season list is already grouped by sport,
            so repeating it there would be noise. */}
        {showGroup && (
          <span className="ml-1 text-[9px] text-[var(--text-dim)]">{e.group}</span>
        )}
      </span>
      <span
        className="ml-auto flex flex-shrink-0 items-baseline gap-1 text-[10px] text-[var(--text-dim)]"
      >
        {e.state}
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: live ? "var(--accent)" : "var(--text-dim)" }}
        />
      </span>
    </li>
  );
}

/** Grouped by sport, one line per sport, so a long list stays a few rows rather than many. */
function ByGroup({ entries }: { entries: SeasonEntry[] }) {
  const groups: { group: string; icon: string; items: SeasonEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.group === e.group) last.items.push(e);
    else groups.push({ group: e.group, icon: e.icon, items: [e] });
  }
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {groups.map((g) => (
        <li key={g.group} className="text-xs leading-relaxed">
          <span aria-hidden className="mr-1 text-[11px]">{g.icon}</span>
          <span className="text-[var(--text)]">{g.group}</span>
          <span className="text-[var(--text-dim)]">
            {" "}
            {g.items.map((e, i) => (
              <span key={e.slug}>{i > 0 && ", "}<Name e={e} /></span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "8 in season · 3 in the playoffs" — zero-count buckets are dropped, never shown as 0. */
function tally(parts: [number, string][]): string {
  return parts.filter(([n]) => n > 0).map(([n, noun]) => `${n} ${noun}`).join(" · ");
}

export default function WhatsOn() {
  const { playoffs, knockouts, inSeason, startingSoon } = seasonSnapshot();
  const elections = politicsEvents();

  // The teases. Counts alone say how much is inside; the nearest dated thing says why it
  // is worth opening today rather than some other day.
  const sportsTease = tally([
    [inSeason.length, "leagues in season"],
    [playoffs.length, "in the playoffs"],
    [knockouts.length, "knockouts running"],
    [startingSoon.length, "starting soon"],
  ]) || "Nothing running right now.";
  const nextElection = elections[0];
  const geographyTease = nextElection
    ? `${elections.length} elections dated · next ${nextElection.label}, ${nextElection.whenLabel}`
    : "Election dates, forecasts and every country hub.";

  return (
    <Collapsible sportsTease={sportsTease} geographyTease={geographyTease}>
      <Panel
        title="Sports"
        href="/sports"
        links={[
          {
            label: "Live standings",
            href: "/sports/standings",
            hint: "Tables across every league above, with playoff odds, plus what is on today, what just finished and what is coming up.",
          },
          {
            label: "Predictions",
            href: "/predictions",
            hint: "Simulated title races for the NFL, MLB, College Football, the Premier League and the Champions League, every call scored in public.",
          },
        ]}
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          {/* One column is the leagues that are simply running; the other is everything
              with a stage attached, plus what opens next. Ashwin, 2026-09-13. */}
          <Col title={`In season (${inSeason.length})`}>
            <ByGroup entries={inSeason} />
          </Col>
          <div className="space-y-4">
            {playoffs.length > 0 && (
              <Col title="In the playoffs">
                <ul className="m-0 list-none space-y-1 p-0">
                  {playoffs.map((e) => <EntryRow key={e.slug} e={e} live showGroup />)}
                </ul>
              </Col>
            )}
            {knockouts.length > 0 && (
              // One row each, carrying the stage. Ashwin, 2026-09-13: "it doesn't really
              // make sense to just have it as a list ... you should kind of say Champions
              // League league phase, Europa League league phase." A cup's name alone says
              // nothing about whether it matters this week; the stage does.
              <Col title={`Knockouts (${knockouts.length})`}>
                <ul className="m-0 list-none space-y-1 p-0">
                  {knockouts.map((e) => <EntryRow key={e.slug} e={e} live showGroup />)}
                </ul>
              </Col>
            )}
            {startingSoon.length > 0 && (
              <Col title="Starting soon">
                <ul className="m-0 list-none space-y-1 p-0">
                  {startingSoon.map((e) => <EntryRow key={e.slug} e={e} live={false} showGroup />)}
                </ul>
              </Col>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Geography"
        href="/geography"
        links={[
          {
            label: "Elections atlas",
            href: "/elections",
            hint: "Every country hub, with the last result and the next confirmed date.",
          },
          {
            // The same hub as the Sports panel links to, described for what it holds
            // THIS side of the page. /predictions carries live election models beside
            // the league simulations, so both panels have a real reason to point at it.
            label: "Election forecasts",
            href: "/predictions",
            hint: "Live models for the races ahead, scored against the result once it lands.",
          },
        ]}
      >
        <Col title="Next elections">
          {elections.length === 0 ? (
            <p className="m-0 text-xs text-[var(--text-dim)]">Nothing dated yet.</p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0">
              {elections.map((e, i) => (
                <li key={`${e.label}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {/* Ashwin, 2026-09-13: "always show the flag when you're showing a
                        country." flagcdn at 2x for a 15px box, and alt="" because the
                        country's name is right beside it. */}
                    {e.flag && (
                      <img
                        src={flagUrlByCode(e.flag)}
                        alt=""
                        aria-hidden
                        width={15}
                        height={11}
                        loading="lazy"
                        decoding="async"
                        className="flex-shrink-0 rounded-[1px]"
                        style={{ width: 15, height: 11, objectFit: "cover" }}
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {e.href ? (
                        <Link href={e.href} className="hover:text-[var(--accent)]">{e.label}</Link>
                      ) : e.label}
                    </span>
                  </span>
                  <span className="flex-shrink-0 tabular-nums text-[10px] text-[var(--text-muted)]">{e.whenLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Col>
      </Panel>
    </Collapsible>
  );
}
