import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const ACCENT = "#38bdf8";

export default function Icon() {
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
          borderRadius: 6,
          color: ACCENT,
          fontFamily: "system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        N
      </div>
    ),
    { ...size },
  );
}
