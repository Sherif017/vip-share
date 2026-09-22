import { ImageResponse } from "next/og";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
          background: "#070707",
        }}
      >
        <span
          style={{
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: -1,
            color: "#f7f4ee",
          }}
        >
          K
        </span>

        <div
          style={{
            position: "absolute",
            bottom: 8,
            width: 16,
            height: 4,
            borderRadius: 1,
            background: "#d8b56a",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
