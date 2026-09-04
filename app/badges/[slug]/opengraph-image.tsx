import { ImageResponse } from "next/og";
import {
  getBadge,
  getLiveBadgeSlugs,
  getQualifyingMetros,
} from "@/lib/badges";

// Per-badge Open Graph share card, auto-discovered by Next.js for
// /badges/[slug]. Pre-rendered at build time for live badges.

export const alt = "Citizen of Nowhere: Badge share card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return getLiveBadgeSlugs().map((slug) => ({ slug }));
}

const BG = "#08080D";
const ACCENT = "#4ECDC4";
const TEXT = "#E8E8ED";
const TEXT_MUTED = "#8888A0";
const TEXT_DIM = "#55556A";

export default async function BadgeOgCard({
  params,
}: {
  params: { slug: string };
}) {
  const badge = getBadge(params.slug);
  if (!badge || badge.status !== "live") {
    return new ImageResponse(
      (
        <div
          style={{
            background: BG,
            color: TEXT,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
          }}
        >
          Badge not found
        </div>
      ),
      { ...size },
    );
  }

  const metros = getQualifyingMetros(badge);
  const top = metros.slice(0, 5);

  return new ImageResponse(
    (
      <div
        style={{
          background: BG,
          color: TEXT,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 60px 50px 60px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 13, color: ACCENT, letterSpacing: 2, fontWeight: 700 }}>
            BADGE
          </span>
          <span style={{ color: TEXT_DIM }}>·</span>
          <span style={{ fontSize: 13, color: TEXT_MUTED }}>
            rankings.citizenofnowhere.org
          </span>
        </div>

        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 20,
          }}
        >
          <span style={{ fontSize: 90 }}>{badge.emoji}</span>
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            {badge.name}
          </span>
        </div>

        {/* Short description */}
        <div
          style={{
            fontSize: 22,
            color: TEXT_MUTED,
            marginTop: 14,
            maxWidth: 1000,
            lineHeight: 1.35,
          }}
        >
          {badge.shortDesc}
        </div>

        {/* Stats + top metros row */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 40,
          }}
        >
          {/* Count callout */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 16,
                color: TEXT_DIM,
                letterSpacing: 1.5,
                fontWeight: 600,
              }}
            >
              QUALIFYING METROS
            </span>
            <span
              style={{
                fontSize: 80,
                color: ACCENT,
                fontWeight: 800,
                lineHeight: 1,
                marginTop: 4,
              }}
            >
              {metros.length}
            </span>
          </div>

          {/* Top 5 list */}
          {top.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                maxWidth: 700,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: TEXT_DIM,
                  letterSpacing: 1.5,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                LEADING THE LIST
              </span>
              {top.map((m) => (
                <div
                  key={m.slug}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    fontSize: 22,
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: TEXT, fontWeight: 700 }}>
                    {m.name}
                  </span>
                  <span style={{ color: TEXT_MUTED, fontSize: 16 }}>
                    {m.country}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size },
  );
}
