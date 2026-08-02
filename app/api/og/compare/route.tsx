import { ImageResponse } from "next/og";
import { getMetroDetail } from "@/lib/data";
import { computeTier } from "@/lib/tiers";

// Comparison OG card. Accepts up to four metro slugs via the `m` query param
// (comma-separated): /api/og/compare?m=london,new-york
//
// Two metros: vertical split with tier pills, scores, and a per-dimension
// verdict strip across the bottom. This is the canonical share image that
// /matchups/[slug] pages will inherit when they ship.
//
// Three or four metros: a row of compact cards. Used when /compare is shared
// with more than two metros selected.
//
// Rendered on demand via Node runtime because lib/data uses readFileSync.
// Caches naturally because the URL parameters are deterministic.

export const runtime = "nodejs";

const SIZE = { width: 1200, height: 630 };
const BG = "#0d1117";
const TEXT = "#ffffff";
const MUTED = "#9ca3af";
const SUBMUTED = "#6b7280";
const RULE = "#1f2937";

// Dimensions surfaced in the verdict strip for the two-metro layout. We pick
// six economically and culturally meaningful dimensions; each row in the
// strip shows which metro ranks higher, with tie handling.
const VERDICT_DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "marketCap", label: "Market cap" },
  { key: "majorLeagueTeams", label: "Major teams" },
  { key: "topUniHospResearch", label: "Universities" },
  { key: "museumsLandmarks", label: "Culture" },
  { key: "skyscrapers", label: "Skyscrapers" },
  { key: "luxuryStars", label: "Luxury" },
];

function parseRank(rankStr: string | null | undefined): number {
  if (!rankStr) return Infinity;
  const clean = String(rankStr).replace(/^T-/, "");
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : Infinity;
}

function parseSlugs(searchParams: URLSearchParams): string[] {
  const raw = searchParams.get("m") || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 4);
}

function fallbackImage(message: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE.width,
          height: SIZE.height,
          background: BG,
          color: TEXT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 36,
        }}
      >
        {message}
      </div>
    ),
    { ...SIZE },
  );
}

// Rendering is pure CPU work keyed only by the `m` query param, so a hit
// with the same slugs always produces the same image. Cache at the CDN so
// repeated/abusive requests for the same comparison don't re-render on
// every hit; slug lookups against local JSON are cheap even on a miss.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=2592000",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugs = parseSlugs(url.searchParams);
  if (slugs.length < 2) {
    return fallbackImage("Global Metro Power Rankings");
  }
  const details = slugs
    .map((slug) => getMetroDetail(slug))
    .filter((d): d is NonNullable<ReturnType<typeof getMetroDetail>> => Boolean(d));
  if (details.length < 2) {
    return fallbackImage("Comparison unavailable");
  }

  const res =
    details.length === 2
      ? renderTwoMetro(details[0], details[1])
      : renderGrid(details);
  for (const [k, v] of Object.entries(CACHE_HEADERS)) res.headers.set(k, v);
  return res;
}

// ============================================================================
// Two-metro layout: editorial split with verdict strip
// ============================================================================

function renderTwoMetro(
  a: NonNullable<ReturnType<typeof getMetroDetail>>,
  b: NonNullable<ReturnType<typeof getMetroDetail>>,
) {
  const tierA = computeTier(a.metro.score);
  const tierB = computeTier(b.metro.score);

  const verdictRows = VERDICT_DIMENSIONS.map(({ key, label }) => {
    const rA = parseRank(a.dimRanks?.[key]);
    const rB = parseRank(b.dimRanks?.[key]);
    let winner: "a" | "b" | "tie" | "neither" = "neither";
    if (Number.isFinite(rA) || Number.isFinite(rB)) {
      if (rA === rB) winner = "tie";
      else if (rA < rB) winner = "a";
      else winner = "b";
    }
    return { key, label, winner };
  });

  const aWins = verdictRows.filter((r) => r.winner === "a").length;
  const bWins = verdictRows.filter((r) => r.winner === "b").length;

  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE.width,
          height: SIZE.height,
          background: BG,
          color: TEXT,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "32px 48px 0 48px",
            fontSize: 13,
            color: MUTED,
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex" }}>HEAD TO HEAD</div>
          <div style={{ display: "flex", color: SUBMUTED, letterSpacing: 0 }}>
            rankings.citizenofnowhere.org
          </div>
        </div>

        {/* Two-metro split */}
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: "0 48px",
            paddingTop: 56,
          }}
        >
          {/* Left metro */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderLeft: `4px solid ${tierA.accentHex}`,
              paddingLeft: 24,
              paddingRight: 16,
            }}
          >
            <div
              style={{
                fontSize: a.metro.name.length > 14 ? 64 : 78,
                fontWeight: 600,
                letterSpacing: -2,
                lineHeight: 1,
                color: TEXT,
                display: "flex",
              }}
            >
              {a.metro.name}
            </div>
            <div
              style={{
                fontSize: 18,
                color: MUTED,
                marginTop: 12,
                display: "flex",
              }}
            >
              {a.metro.country}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  border: `1.5px solid ${tierA.accentHex}`,
                  borderRadius: 999,
                  padding: "6px 16px",
                  color: tierA.accentHex,
                  fontSize: 12,
                  letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                {tierA.name.toUpperCase()}
              </div>
              <div style={{ display: "flex", color: SUBMUTED, fontSize: 13 }}>
                #{a.metro.rank}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 36,
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 88,
                  fontWeight: 600,
                  color: TEXT,
                  letterSpacing: -2,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {a.metro.score.toFixed(1)}
              </div>
              <div style={{ display: "flex", color: SUBMUTED, fontSize: 14 }}>
                Power Score
              </div>
            </div>
          </div>

          {/* VS divider */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              width: 60,
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: SUBMUTED,
                fontWeight: 600,
                letterSpacing: 2,
                display: "flex",
              }}
            >
              VS
            </div>
          </div>

          {/* Right metro */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderLeft: `4px solid ${tierB.accentHex}`,
              paddingLeft: 24,
              paddingRight: 16,
            }}
          >
            <div
              style={{
                fontSize: b.metro.name.length > 14 ? 64 : 78,
                fontWeight: 600,
                letterSpacing: -2,
                lineHeight: 1,
                color: TEXT,
                display: "flex",
              }}
            >
              {b.metro.name}
            </div>
            <div
              style={{
                fontSize: 18,
                color: MUTED,
                marginTop: 12,
                display: "flex",
              }}
            >
              {b.metro.country}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  border: `1.5px solid ${tierB.accentHex}`,
                  borderRadius: 999,
                  padding: "6px 16px",
                  color: tierB.accentHex,
                  fontSize: 12,
                  letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                {tierB.name.toUpperCase()}
              </div>
              <div style={{ display: "flex", color: SUBMUTED, fontSize: 13 }}>
                #{b.metro.rank}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 36,
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 88,
                  fontWeight: 600,
                  color: TEXT,
                  letterSpacing: -2,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {b.metro.score.toFixed(1)}
              </div>
              <div style={{ display: "flex", color: SUBMUTED, fontSize: 14 }}>
                Power Score
              </div>
            </div>
          </div>
        </div>

        {/* Verdict strip across the bottom */}
        <div
          style={{
            display: "flex",
            borderTop: `1px solid ${RULE}`,
            padding: "20px 48px",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: SUBMUTED,
              letterSpacing: 1,
            }}
          >
            <span>VERDICT</span>
            <span style={{ color: tierA.accentHex, fontWeight: 600 }}>
              {a.metro.name} {aWins}
            </span>
            <span>·</span>
            <span style={{ color: tierB.accentHex, fontWeight: 600 }}>
              {bWins} {b.metro.name}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            {verdictRows.map((row) => {
              const color =
                row.winner === "a"
                  ? tierA.accentHex
                  : row.winner === "b"
                  ? tierB.accentHex
                  : SUBMUTED;
              return (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: 11,
                    color: SUBMUTED,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 8,
                      height: 8,
                      background: color,
                      borderRadius: 999,
                      marginBottom: 4,
                    }}
                  />
                  <div style={{ display: "flex" }}>{row.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),
    { ...SIZE },
  );
}

// ============================================================================
// Grid layout (3 or 4 metros)
// ============================================================================

function renderGrid(
  details: Array<NonNullable<ReturnType<typeof getMetroDetail>>>,
) {
  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE.width,
          height: SIZE.height,
          background: BG,
          color: TEXT,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, sans-serif",
          padding: "32px 48px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            color: MUTED,
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex" }}>METRO COMPARISON</div>
          <div style={{ display: "flex", color: SUBMUTED, letterSpacing: 0 }}>
            rankings.citizenofnowhere.org
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            marginTop: 32,
            gap: 16,
          }}
        >
          {details.map((d) => {
            const tier = computeTier(d.metro.score);
            return (
              <div
                key={d.metro.slug}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  borderLeft: `4px solid ${tier.accentHex}`,
                  paddingLeft: 16,
                  paddingTop: 8,
                }}
              >
                <div
                  style={{
                    fontSize: d.metro.name.length > 14 ? 36 : 44,
                    fontWeight: 600,
                    letterSpacing: -1,
                    color: TEXT,
                    lineHeight: 1.05,
                    display: "flex",
                  }}
                >
                  {d.metro.name}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: MUTED,
                    marginTop: 8,
                    display: "flex",
                  }}
                >
                  {d.metro.country}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 16,
                    border: `1.5px solid ${tier.accentHex}`,
                    borderRadius: 999,
                    padding: "4px 12px",
                    alignSelf: "flex-start",
                    color: tier.accentHex,
                    fontSize: 11,
                    letterSpacing: 1,
                    fontWeight: 600,
                  }}
                >
                  {tier.name.toUpperCase()}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginTop: "auto",
                    paddingTop: 24,
                  }}
                >
                  <div style={{ display: "flex", color: SUBMUTED, fontSize: 12, letterSpacing: 1 }}>
                    RANK #{d.metro.rank}
                  </div>
                  <div
                    style={{
                      fontSize: 56,
                      fontWeight: 600,
                      color: TEXT,
                      letterSpacing: -1,
                      lineHeight: 1,
                      marginTop: 8,
                      display: "flex",
                    }}
                  >
                    {d.metro.score.toFixed(1)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { ...SIZE },
  );
}
