import { ogSectionFor } from "@/lib/ogBrand";

// The one share card, as a JSX element for ImageResponse: used by the /og
// route (any page, by title and path) and by app/opengraph-image.tsx (the
// home page's file-convention card). Satori rules: every box is display:flex,
// no CSS variables, the bundled sans, Twemoji for the emoji.

const BG = "#08080D";
const CARD = "#12121A";
const TEXT = "#E8E8ED";
const MUTED = "#9A9AAB";
const ACCENT = "#4ECDC4";

export function brandCard(rawTitle: string, path: string) {
  const { emoji, kicker } = ogSectionFor(path);
  const home = !rawTitle || path === "/";
  const title = rawTitle.slice(0, 90);
  // Long titles step down; the card is read at thumbnail size in a chat app.
  const size = title.length > 60 ? 52 : title.length > 36 ? 64 : 80;
  return (
    <div
      style={{
        width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: BG, color: TEXT, padding: 64, fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 14, height: 14, background: ACCENT, borderRadius: 3 }} />
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: MUTED }}>CITIZEN OF NOWHERE</div>
        </div>
        {kicker ? <div style={{ display: "flex", fontSize: 26, letterSpacing: 3, color: ACCENT, textTransform: "uppercase" }}>{kicker}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <div style={{ display: "flex", width: 220, height: 220, alignItems: "center", justifyContent: "center", background: CARD, borderRadius: 32, fontSize: 140, flexShrink: 0 }}>
          {emoji}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          <div style={{ display: "flex", fontSize: home ? 80 : size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>
            {home ? "Citizen of Nowhere" : title}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
            {home ? "Every metro, every country, every season, measured." : "Citizen of Nowhere"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: MUTED }}>
        <div style={{ display: "flex" }}>rankings.citizenofnowhere.org</div>
        <div style={{ display: "flex", width: 240, height: 4, background: ACCENT, borderRadius: 2 }} />
      </div>
    </div>
  );
}
