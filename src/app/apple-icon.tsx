import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Иконка «На экран Домой» (iOS): тот же монохромный знак MGIMO Hub
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <svg width="132" height="132" viewBox="0 0 24 24">
          <path d="M5.5 17.5V11.25a3.25 3.25 0 0 1 6.5 0V17.5M12 11.25a3.25 3.25 0 0 1 6.5 0V17.5" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="18.6" cy="5.6" r="1.55" fill="#ffffff" />
        </svg>
      </div>
    ),
    size,
  );
}
