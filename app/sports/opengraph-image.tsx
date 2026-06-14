import { ImageResponse } from "next/og";

export const alt = "Zone Zero Sports Hub \u2014 Citizen of Nowhere";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#08080D",
          color: "#E8E8ED",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: "#E8E8ED", display: "flex" }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "44px 56px 0 56px",
            fontSize: 15,
            color: "#8888A0",
            letterSpacing: 3,
          }}
        >
          <div style={{ display: "flex" }}>CITIZEN OF NOWHERE</div>
          <div style={{ display: "flex", color: "#55556A", letterSpacing: 0 }}>rankings.citizenofnowhere.org/sports</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", padding: "0 56px" }}>
          <div style={{ display: "flex", marginBottom: 26 }}>
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                border: "8px solid #E8E8ED",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 17, height: 17, borderRadius: "50%", background: "#E8E8ED", display: "flex" }} />
            </div>
          </div>
          <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: -2, lineHeight: 1.0, display: "flex" }}>
            Zone Zero
          </div>
          <div style={{ fontSize: 38, color: "#8888A0", marginTop: 12, letterSpacing: 6, textTransform: "uppercase", display: "flex" }}>
            Sports Hub
          </div>
        </div>

        <div style={{ display: "flex", padding: "0 56px 52px 56px", fontSize: 22, color: "#8888A0", letterSpacing: 1 }}>
          <div style={{ display: "flex" }}>Every metro keeps score. The world is our outfield.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
