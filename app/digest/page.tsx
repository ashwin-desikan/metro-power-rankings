import type { Metadata } from "next";
import {
  FILTER_WINDOW_DAYS, getDigestItemsForDate, getDigestItemsSince,
  getLatestDigestDate, getRecentDigestDates,
} from "@/lib/digestFeed";
import { facetsFor } from "@/lib/digestFacets";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { DigestDayView, EmptyDigest } from "./_shared/ui";

// The latest digest. Read from Supabase at request time (lib/digestFeed), so a new
// morning's stories appear within the revalidate window and never cost a build.
export const revalidate = 1800;

const PAGE_PATH = "/digest";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "From the Digest";
const PAGE_DESCRIPTION =
  "Every story from the daily newsletter digest, each with a direct link and one line on why it matters, plus the full archive.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default async function DigestPage() {
  // The window fetch is the same one every filter page uses, so it is already cached by
  // the time a reader clicks through: the rail costs nothing extra here.
  const [day, dates, window] = await Promise.all([
    getLatestDigestDate(), getRecentDigestDates(), getDigestItemsSince(),
  ]);
  const items = day ? await getDigestItemsForDate(day) : [];
  if (!day || items.length === 0) return <EmptyDigest />;
  return (
    <DigestDayView
      day={day}
      items={items}
      dates={dates}
      isLatest
      facets={facetsFor(window)}
      windowDays={FILTER_WINDOW_DAYS}
    />
  );
}
