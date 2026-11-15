import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryPublishPanel from "../directories/DirectoryPublishPanel.jsx";
import { SettingsLayout } from "../ui/index.js";

/** Settings › Publishing — DirectoryPublishPanel. Custom domains live on the separate Domain page. */
export default function DirectoryPublishingRoute() {
  const { directory, client, canPublish, recordEvent, refetch } = useDirectory();
  return (
    <SettingsLayout head={{ title: "Publishing" }}>
      <DirectoryPublishPanel
        directory={directory}
        clientSlug={client?.slug}
        canPublish={canPublish}
        recordEvent={recordEvent}
        onPublished={refetch}
      />
    </SettingsLayout>
  );
}
