import React from "react";
import { Text } from "@mantine/core";

/**
 * Approximates generate_directory_site/index.ts's homepage `.card`/
 * `.card-logo-box` markup for an entry — shared by the Panel Style tab
 * (editing the override) and the Preview & Publish tab (read-only). Not a
 * byte-for-byte match; actual fonts/spacing come from the directory's theme.
 */
export default function EntryCardPreview({ name, imageUrl, backgroundColor }) {
  return (
    <div style={{ width: 220, border: "1px solid var(--lc-border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
      <div style={{ height: 158, background: backgroundColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
