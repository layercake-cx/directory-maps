import React from "react";
import { Link } from "react-router-dom";
import { Text } from "@mantine/core";

/** Placeholder — a live entry preview and single-entry publish land in a later phase. */
export default function EntryPreviewPublishTab({ backPath }) {
  return (
    <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
      <Text size="sm" fw={600} mb={8}>Preview & publish</Text>
      <Text size="xs" c="dimmed" mb={10}>
        A live preview of this entry's card and page, plus publishing just this entry, are coming in a later phase.
        For now, publish the whole directory from the directory's Publish panel to push this entry's changes live.
      </Text>
      <Link to={backPath}>← Back to directory (Publish panel)</Link>
    </div>
  );
}
