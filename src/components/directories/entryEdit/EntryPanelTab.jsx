import React from "react";
import { Text } from "@mantine/core";

/** Placeholder — panel background color, custom image and live preview land in a later phase. */
export default function EntryPanelTab() {
  return (
    <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
      <Text size="sm" fw={600} mb={8}>Panel style</Text>
      <Text size="xs" c="dimmed">
        A custom panel image, background color, and a live preview are coming in a later phase.
        Today the homepage card always shows the logo on the directory's themed background.
      </Text>
    </div>
  );
}
