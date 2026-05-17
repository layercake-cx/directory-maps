import React from "react";

const TILE = 256;

/**
 * OpenStreetMap tile mosaic for map list / publish previews (no API key).
 * Tile math uses width × height; the root fills its parent when className/style are set.
 */
export default function MapTileThumb({
  lat,
  lng,
  zoom,
  width = 300,
  height = 130,
  className,
  style,
}) {
  const latNum = lat != null && lat !== "" ? Number(lat) : NaN;
  const lngNum = lng != null && lng !== "" ? Number(lng) : NaN;

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return (
      <div
        className={className}
        style={{ width: "100%", height: "100%", background: "#e8e6df", ...style }}
        aria-hidden="true"
      />
    );
  }

  const z = Math.max(1, Math.min(18, Math.round(Number(zoom) || 12)));
  const n = Math.pow(2, z);
  const latRad = (latNum * Math.PI) / 180;
  const xf = ((lngNum + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const cx = Math.floor(xf);
  const cy = Math.floor(yf);
  const ox = width / 2 - (xf - cx) * TILE;
  const oy = height / 2 - (yf - cy) * TILE;
  const tiles = [];

  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      const tx = ((cx + dx) % n + n) % n;
      const ty = cy + dy;
      if (ty < 0 || ty >= n) continue;
      const left = ox + dx * TILE;
      const top = oy + dy * TILE;
      if (left + TILE < 0 || left > width || top + TILE < 0 || top > height) continue;
      tiles.push({ tx, ty, left, top });
    }
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#e8e0d8",
        ...style,
      }}
    >
      {tiles.map(({ tx, ty, left, top }) => (
        <img
          key={`${tx}-${ty}`}
          src={`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`}
          width={TILE}
          height={TILE}
          alt=""
          style={{ position: "absolute", left, top, display: "block", userSelect: "none" }}
          draggable={false}
          loading="lazy"
        />
      ))}
    </div>
  );
}
