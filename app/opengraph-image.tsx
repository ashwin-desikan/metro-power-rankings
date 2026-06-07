import { ImageResponse } from "next/og";

// Site-wide DEFAULT Open Graph / Twitter share card. Next auto-applies this to
// every route that does not define its own opengraph-image, so the home page
// and all subpages get a branded preview instead of a blank one. Routes with
// their own card (/rankings/[slug], /badges/[slug]) still override it.
// A single image rendered once at build; negligible cost.

export const alt = "Global Metro Power Rankings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#38bdf8";

export default function Image() {
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
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: ACCENT, display: "flex" }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "44px 56px 0 56px",
            fontSize: 15,
            color: "#9ca3af",
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex" }}>CITIZEN OF NOWHERE</div>
          <div style={{ display: "flex", color: "#6b7280", letterSpacing: 0 }}>rankings.citizenofnowhere.org</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", padding: "0 56px" }}>
          <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02, display: "flex" }}>
            Global Metro
          </div>
          <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02, display: "flex" }}>
            Power Rankings
          </div>
          <div style={{ fontSize: 30, color: "#9ca3af", marginTop: 28, display: "flex" }}>
            Measuring what makes a city matter.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            padding: "0 56px 52px 56px",
            fontSize: 24,
            color: "#e5e7eb",
          }}
        >
          <div style={{ display: "flex" }}>
            <span style={{ color: ACCENT, fontWeight: 600 }}>4,200+</span>
            <span style={{ marginLeft: 10, color: "#9ca3af" }}>metros</span>
          </div>
          <div style={{ display: "flex" }}>
            <span style={{ color: ACCENT, fontWeight: 600 }}>16</span>
            <span style={{ marginLeft: 10, color: "#9ca3af" }}>dimensions</span>
          </div>
          <div style={{ display: "flex" }}>
            <span style={{ color: ACCENT, fontWeight: 600 }}>237</span>
            <span style={{ marginLeft: 10, color: "#9ca3af" }}>countries</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
