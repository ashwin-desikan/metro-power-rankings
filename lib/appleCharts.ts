import "server-only";

// Live Charts data source: Apple's public "Marketing Tools" RSS feeds
// (rss.marketingtools.apple.com), which Apple provides for displaying and
// linking to Apple Music content. These are Apple Music's own most-played
// charts, per country, NOT the Billboard Hot 100 or the UK Official Singles
// Chart (those are proprietary to Luminate / the Official Charts Company and
// are not licensable for free). We attribute Apple and link back to Apple
// Music, and the UI links out to both official charts.

export type ChartTrack = {
  rank: number;
  title: string;
  artist: string;
  artwork: string;
  url: string;
};

export type AppleChart = {
  code: string;
  label: string;
  official: { name: string; href: string };
  title: string;
  updated: string; // RFC-822 string from the feed
  tracks: ChartTrack[];
};

const FEEDS: { code: string; label: string; official: { name: string; href: string } }[] = [
  {
    code: "us",
    label: "United States",
    official: { name: "Billboard Hot 100", href: "https://www.billboard.com/charts/hot-100/" },
  },
  {
    code: "gb",
    label: "United Kingdom",
    official: { name: "Official Singles Chart", href: "https://www.officialcharts.com/charts/singles-chart/" },
  },
];

type AppleResult = { name?: string; artistName?: string; artworkUrl100?: string; url?: string };
type AppleFeed = { feed?: { title?: string; updated?: string; results?: AppleResult[] } };

async function fetchOne(feed: (typeof FEEDS)[number]): Promise<AppleChart | null> {
  try {
    const res = await fetch(
      `https://rss.marketingtools.apple.com/api/v2/${feed.code}/music/most-played/100/songs.json`,
      { next: { revalidate: 10800 }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AppleFeed;
    const results = data.feed?.results ?? [];
    const tracks: ChartTrack[] = results
      .filter((r) => r.name && r.artistName)
      .map((r, i) => ({
        rank: i + 1,
        title: r.name as string,
        artist: r.artistName as string,
        // Upgrade the 100px thumbnail to a crisper 160px render.
        artwork: (r.artworkUrl100 ?? "").replace("100x100bb", "160x160bb"),
        url: r.url ?? "",
      }));
    if (tracks.length === 0) return null;
    return {
      code: feed.code,
      label: feed.label,
      official: feed.official,
      title: data.feed?.title ?? "Top Songs",
      updated: data.feed?.updated ?? "",
      tracks,
    };
  } catch {
    return null;
  }
}

// Never throws — a failed feed is simply omitted so the page still renders.
export async function getAppleCharts(): Promise<AppleChart[]> {
  const charts = await Promise.all(FEEDS.map(fetchOne));
  return charts.filter((c): c is AppleChart => c !== null);
}
