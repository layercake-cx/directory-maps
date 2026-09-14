import React from "react";
import { Text } from "@mantine/core";
import { DEFAULT_CARD_LOGO_BG, useSuggestedLogoBackground } from "../../../lib/logoBackground.js";

/**
 * Approximates generate_directory_site/index.ts's homepage `.card`/
 * `.card-logo-box` markup for an entry — shared by the Panel Style tab
 * (editing the override) and the Preview & Publish tab (read-only). Not a
 * byte-for-byte match; actual fonts/spacing come from the directory's theme.
 *
 * `backgroundColor` is an optional editor override. When omitted, the box
 * defaults to white and flips to black if the logo looks like light ink on
 * a transparent background.
 */
export default function EntryCardPreview({ name, imageUrl, backgroundColor }) {
  const bg = useSuggestedLogoBackground(imageUrl, backgroundColor) || DEFAULT_CARD_LOGO_BG;

  return (
    <div style={{ width: 220, border: "1px solid var(--lc-border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
      <div style={{ height: 158, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ maxWidth: "70%", maxHeight: "70%", objectFit: "contain" }} />
        ) : (
          <Text size="xs" c="dimmed">No image</Text>
        )}
      </div>
      <div style={{ padding: 14 }}>
        <Text size="sm" fw={700} truncate>{name || "Entry name"}</Text>
      </div>
    </div>
  );
}
