import React from "react";
import { MAP_STYLE_COLORS } from "./mapDashboardData.js";

/** Little map illustration for a style preset. Colours come from MAP_STYLE_COLORS (data). */
export default function MapStyleThumb({ styleId }) {
  const c = MAP_STYLE_COLORS[styleId] || MAP_STYLE_COLORS.roadmap;
  return (
    <svg viewBox="0 0 90 56" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="90" height="56" fill={c.water} />
      <polygon points="0,0 38,0 44,8 36,20 20,24 8,18 0,22" fill={c.land} />
      <polygon points="42,0 90,0 90,22 78,28 64,20 52,24 44,14" fill={c.land} />
      <polygon points="0,32 14,26 28,32 32,44 20,56 0,56" fill={c.land} />
      <polygon points="56,30 72,24 90,30 90,56 52,56 50,42" fill={c.land} />
      <path d="M16,18 Q30,10 44,14 Q58,18 68,20" stroke={c.road} strokeWidth="1.2" fill="none" opacity="0.7" />
      <line x1="0" y1="28" x2="90" y2="28" stroke={c.border} strokeWidth="0.5" opacity="0.4" strokeDasharray="3,2" />
    </svg>
  );
}
