import { ImageResponse } from "next/og";

export const alt = "MASTERKRAFT: Engineered for Fitness";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0b",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 40,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#f7373a",
            fontWeight: 700,
          }}
        >
          MASTERKRAFT
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 128,
            fontWeight: 800,
            lineHeight: 1,
            marginTop: 24,
            textTransform: "uppercase",
            letterSpacing: -2,
          }}
        >
          <div style={{ display: "flex" }}>Engineered</div>
          <div style={{ display: "flex" }}>for Fitness</div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "rgba(255,255,255,0.65)", marginTop: 44 }}>
          Commercial fitness equipment and fit-out
        </div>
      </div>
    ),
    { ...size }
  );
}
