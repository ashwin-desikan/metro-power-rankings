import "server-only";

// Digest feed (/ homepage "From the Digest" section).
//
// Source: the mini's daily newsletter pipeline. Its editorial step writes
// builds/daily-newsletter-digest/<date>/feed.json, and post-socials.sh pushes it to
// Supabase (public.digest_run, public.digest_item) via scripts push_feed.py.
//
// Read here over PostgREST at REQUEST time with ISR, exactly like lib/clubFootballLive.ts
// reads GitHub raw: the feed refreshes on its own and NEVER costs a Vercel build. Do not
// move this into public/data — that path is build-time and is what the 2/day budget guards.
//
// The anon key is public by design; RLS grants SELECT only (migration create_digest_feed).
// Server-only. Add to scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

const SUPABASE_URL = "https://nmprqkmymrdknffwnuur.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";

const REVALIDATE = 1800; // 30 min. The digest lands once a day at ~08:20 BST.

export type DigestEntity = {
  type: "metro" | "country" | "club" | "league";
  slug: string;
};

export type DigestItem = {
  digestDate: string; // YYYY-MM-DD
  position: number;
  headline: string;
  sourceName: string;
  url: string;
  why: string;
  entities: DigestEntity[];
};

type Row = {
  digest_date: string;
  position: number;
  headline: string;
  source_name: string;
  url: string;
  why: string;
  entities: unknown;
};

const ENTITY_TYPES = new Set(["metro", "country", "club", "league"]);

// The route for an entity. Kept here so a tag can never render as a dead link shape;
// an unknown type yields null and the caller drops the chip.
export function entityHref(e: DigestEntity): string | null {
  switch (e.type) {
    case "metro":
      return `/rankings/${e.slug}`;
    case "country":
      return `/countries/${e.slug}`;
    case "club":
      return `/clubs/${e.slug}`;
    case "league":
      return `/leagues/${e.slug}`;
    default:
      return null;
  }
}

function toEntities(raw: unknown): DigestEntity[] {
  if (!Array.isArray(raw)) return [];
  const out: DigestEntity[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const t = (e as Record<string, unknown>).type;
    const s = (e as Record<string, unknown>).slug;
    if (typeof t === "string" && typeof s === "string" && ENTITY_TYPES.has(t) && s) {
      out.push({ type: t as DigestEntity["type"], slug: s });
    }
  }
  return out;
}

function toItem(r: Row): DigestItem {
  return {
    digestDate: r.digest_date,
    position: r.position,
    headline: r.headline,
    sourceName: r.source_name,
    url: r.url,
    why: r.why,
    entities: toEntities(r.entities),
  };
}

async function query(params: string): Promise<Row[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/digest_item?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows as Row[]) : [];
  } catch {
    // A feed section is never load-bearing. An outage renders an empty section,
    // it does not throw a page.
    return [];
  }
}

const SELECT = "select=digest_date,position,headline,source_name,url,why,entities";

/** Most recent items across all digests, newest digest first. Homepage strip. */
export async function getRecentDigestItems(limit = 12): Promise<DigestItem[]> {
  const rows = await query(
    `${SELECT}&order=digest_date.desc,position.asc&limit=${Math.min(limit, 60)}`,
  );
  return rows.map(toItem);
}

/** Items for one date, in editorial order. */
export async function getDigestItemsForDate(day: string): Promise<DigestItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const rows = await query(`${SELECT}&digest_date=eq.${day}&order=position.asc`);
  return rows.map(toItem);
}

/**
 * Items mentioning one entity, newest first. This is what lets a country, club or
 * league page carry a live "in the news" block keyed to itself.
 */
export async function getDigestItemsForEntity(
  type: DigestEntity["type"],
  slug: string,
  limit = 6,
): Promise<DigestItem[]> {
  if (!ENTITY_TYPES.has(type) || !slug) return [];
  const contains = encodeURIComponent(JSON.stringify([{ type, slug }]));
  const rows = await query(
    `${SELECT}&entities=cs.${contains}&order=digest_date.desc,position.asc&limit=${Math.min(limit, 40)}`,
  );
  return rows.map(toItem);
}

/** The date of the newest digest on file, or null. Use for the as-of stamp. */
export async function getLatestDigestDate(): Promise<string | null> {
  const rows = await query("select=digest_date&order=digest_date.desc&limit=1");
  return rows[0]?.digest_date ?? null;
}
