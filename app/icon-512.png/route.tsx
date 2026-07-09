import { ImageResponse } from "next/og";

// See app/icon-192.png/route.tsx - same icon, 512x512 for the PWA manifest.

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
          fontSize: 308,
          fontWeight: 700,
        }}
      >
        N
      </div>
    ),
    { width: 512, height: 512 },
  );
}
