import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const ACCENT = "#38bdf8";

export default function AppleIcon() {
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
          fontSize: 108,
          fontWeight: 700,
        }}
      >
        N
      </div>
    ),
    { ...size },
  );
}
