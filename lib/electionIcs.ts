// iCalendar (RFC 5545) builder for the election calendar feeds
// (app/elections/calendar.ics and app/elections/calendar/[file]).
// Pure functions only, no filesystem/network, so they are unit-testable
// without a request context.

import { ELECTION_HUBS, type ElectionHubMeta } from "@/lib/electionHubsMeta";
import { BASE_URL } from "@/lib/seo";

const CALDOMAIN = "rankings.citizenofnowhere.org";

/**
 * Fold a single unfolded content line to RFC 5545 §3.1: no physical line may
 * exceed 75 OCTETS (not characters), and a continuation line is CRLF followed
 * by a single space. The 75-octet budget on a continuation line includes that
 * leading space, so its own content budget is 74 octets.
 *
 * Folding must never split a multi-byte UTF-8 character across two physical
 * lines, so a candidate cut point that lands on a UTF-8 continuation byte
 * (10xxxxxx) backs off until it doesn't.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let idx = 0;
  let limit = 75;
  while (idx < bytes.length) {
    let end = Math.min(idx + limit, bytes.length);
    while (end > idx && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.slice(idx, end).toString("utf8"));
    idx = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

/** Escape text per RFC 5545 §3.3.11: backslash, comma, semicolon, newline. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** The ISO day after `iso`, computed in UTC so no timezone can move it. */
export function nextDay(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
}

/** yyyymmdd for DTSTART;VALUE=DATE, from an ELECTION_HUBS "yyyy-mm-dd". */
function isoToBasicDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** UTC "basic" timestamp for DTSTAMP, e.g. 20260907T120000Z. */
export function dtstampNow(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Hubs eligible for the calendar: only a confirmed date is a fact worth
 * putting on someone's calendar (DESIGN-STANDARDS: never print an "expected"
 * date as a date, and the same rule applies to the ICS feed).
 */
export function confirmedHubs(
  hubs: Record<string, ElectionHubMeta> = ELECTION_HUBS,
): ElectionHubMeta[] {
  return Object.values(hubs).filter((h) => h.nextConfidence === "confirmed" && h.nextDate);
}

/** The VEVENT block (as an array of unfolded-then-folded lines) for one hub. */
export function buildHubEvent(m: ElectionHubMeta, dtstamp: string): string[] {
  if (!m.nextDate) return [];
  const uid = `${m.code}-${m.nextDate}@${CALDOMAIN}`;
  const summary = escapeIcsText(`${m.name}: ${m.next}`);
  const description = escapeIcsText(`Next election for ${m.name}. Tracked at ${CALDOMAIN}${m.href}.`);
  return [
    "BEGIN:VEVENT",
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${dtstamp}`),
    foldLine(`DTSTART;VALUE=DATE:${isoToBasicDate(m.nextDate)}`),
    // An all-day event ends the NEXT day in RFC 5545 (DTEND is exclusive);
    // Google and Outlook both show a one-day event without it, Apple shows
    // it too, but a missing DTEND is the most common validator complaint.
    foldLine(`DTEND;VALUE=DATE:${isoToBasicDate(nextDay(m.nextDate))}`),
    foldLine(`SUMMARY:${summary}`),
    foldLine(`URL:${BASE_URL}${m.href}`),
    foldLine(`DESCRIPTION:${description}`),
    "END:VEVENT",
  ];
}

/**
 * The full VCALENDAR document for a set of hubs. An empty `hubs` array is
 * valid: a per-hub feed for a polity with no confirmed date is a calendar
 * with zero VEVENTs, not a 404, so a subscription keeps working once a date
 * is set later.
 */
export function buildCalendar(hubs: ElectionHubMeta[], calName: string, now: Date = new Date()): string {
  const dtstamp = dtstampNow(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Citizen of Nowhere//Elections Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcsText(calName)}`),
    ...hubs.flatMap((h) => buildHubEvent(h, dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
