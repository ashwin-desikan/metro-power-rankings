import { ImageResponse } from "next/og";

// Larger icon for the PWA manifest (app/manifest.ts) - "Add to Home Screen"
// wants 192x192 and 512x512 sizes that app/icon.tsx (favicon) doesn't cover.

const ACCENT = "#38bdf8";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1117",
          color: ACCENT,
          fontFamily: "system-ui, sans-serif",
          fontSize: 116,
          fontWeight: 700,
        }}
      >
        N
      </div>
    ),
    { width: 192, height: 192 },
  );
}
