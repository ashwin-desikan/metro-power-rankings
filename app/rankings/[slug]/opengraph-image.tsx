import { ImageResponse } from "next/og";
import { getMetroDetail, getAllSlugs } from "@/lib/data";
import { computeTier } from "@/lib/tiers";

// Per-metro Open Graph share card. Next.js auto-discovers this file by name
// and wires it into openGraph.images / twitter.images for /rankings/[slug],
// so we do not need to set anything in generateMetadata.
//
// Pre-rendered at build time for every slug via generateStaticParams below.
// Runtime is Node (default) because lib/data uses readFileSync.

export const alt = "Global Metro Power Rankings share card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

// Reader-facing labels for dimension keys. The dimension card on the OG image
// shows "{label} #{rank}" so each metro tells its own story without manual
// curation. Keys must match the dimRanks object produced by extract.py.
const DIM_LABELS: Record<string, string> = {
  majorLeagueTeams: "Major league teams",
  totalTeams: "Total teams",
  majorSportingEvents: "Sporting events",
  companies: "Major companies",
  marketCap: "Market cap",
  culturalEvents: "Cultural events",
  universities: "Universities",
  topUniHospResearch: "Top universities",
  museumsLandmarks: "Museums & landmarks",
  portsExchangesInfra: "Ports & infra",
  airportScore: "Airport",
  luxuryStars: "Luxury hospitality",
  metroStations: "Metro stations",
  suburbStations: "Commuter rail",
  trainHubs: "Train hubs",
  skyscrapers: "Skyscrapers",
};

// Pick the three best dimensions for the metro by numeric rank. Tied ranks
// (e.g. "T-3") strip to 3 for sorting. Empty / null ranks are skipped so a
// metro with only a few populated dimensions does not pad the card with
// blanks. Returns up to three; fewer is fine.
function pickTopThree(
  dimRanks: Record<string, string | null> | undefined,
): Array<{ key: string; rankDisplay: string }> {
  if (!dimRanks) return [];
  return Object.entries(dimRanks)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const numStr = String(v).replace(/^T-/, "");
      const n = parseInt(numStr, 10);
      return { key: k, rankDisplay: String(v), num: Number.isNaN(n) ? Infinity : n };
    })
    .sort((a, b) => a.num - b.num)
    .slice(0, 3)
    .map(({ key, rankDisplay }) => ({ key, rankDisplay }));
}

export default async function Image({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  const detail = getMetroDetail(slug);

  // Fall back to a neutral card if the slug somehow doesn't resolve.
  // Should never happen given generateStaticParams covers every slug.
  if (!detail) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            background: "#0d1117",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            fontSize: 48,
          }}
        >
          Global Metro Power Rankings
        </div>
      ),
      { ...size },
    );
  }

  const { metro, dimRanks } = detail;
  const tier = computeTier(metro.score);
  const top3 = pickTopThree(dimRanks);
  const accent = tier.accentHex;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0d1117",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Tier accent stripe down the left edge. The single colored element
            on the card; tier color is the only colored ink so the metro's
            tier reads at thumbnail size. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            background: accent,
            display: "flex",
          }}
        />

        {/* Top bar: brand wordmark left, canonical URL right. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "40px 48px 0 48px",
            fontSize: 14,
            color: "#9ca3af",
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex" }}>GLOBAL METRO POWER RANKINGS</div>
          <div style={{ display: "flex", color: "#6b7280", letterSpacing: 0 }}>
            rankings.citizenofnowhere.org
          </div>
        </div>

        {/* Main split: editorial slab on the left, data slab on the right. */}
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: "0 48px",
          }}
        >
          {/* Left zone */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 720,
              paddingTop: 80,
            }}
          >
            <div
              style={{
                fontSize: metro.name.length > 14 ? 116 : 148,
                fontWeight: 600,
                letterSpacing: -3,
                lineHeight: 1,
                color: "#ffffff",
                display: "flex",
              }}
            >
              {metro.name}
            </div>
            <div
              style={{
                fontSize: 28,
                color: "#9ca3af",
                marginTop: 28,
                display: "flex",
              }}
            >
              {metro.country}
            </div>

            {/* Tier pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1.5px solid ${accent}`,
                borderRadius: 999,
                padding: "8px 24px",
                marginTop: 36,
                alignSelf: "flex-start",
                color: accent,
                fontSize: 15,
                letterSpacing: 1,
                fontWeight: 600,
              }}
            >
              {tier.name.toUpperCase()}
            </div>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "#1f2937",
                marginTop: 56,
                width: 590,
                display: "flex",
              }}
            />

            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginTop: 36,
                letterSpacing: 2,
                display: "flex",
              }}
            >
              SIGNATURE DIMENSIONS
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 24,
                gap: 56,
              }}
            >
              {top3.map((d) => (
                <div
                  key={d.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <span
                    style={{
                      fontSize: 18,
                      color: "#ffffff",
                      fontWeight: 500,
                    }}
                  >
                    {DIM_LABELS[d.key] || d.key}
                  </span>
                  <span
                    style={{
                      fontSize: 22,
                      color: accent,
                      fontWeight: 600,
                      marginTop: 6,
                    }}
                  >
                    #{d.rankDisplay}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Vertical divider */}
          <div
            style={{
              width: 1,
              background: "#1f2937",
              marginLeft: 24,
              marginRight: 24,
              marginTop: 80,
              marginBottom: 80,
              display: "flex",
            }}
          />

          {/* Right zone: rank and score */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              paddingTop: 80,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "#6b7280",
                letterSpacing: 2,
                display: "flex",
              }}
            >
              RANK
            </div>
            <div
              style={{
                fontSize: 180,
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: -4,
                lineHeight: 1,
                marginTop: 12,
                display: "flex",
              }}
            >
              {metro.rank}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#6b7280",
                letterSpacing: 2,
                marginTop: 60,
                display: "flex",
              }}
            >
              SCORE
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: -1,
                marginTop: 8,
                display: "flex",
              }}
            >
              {metro.score.toFixed(1)}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
