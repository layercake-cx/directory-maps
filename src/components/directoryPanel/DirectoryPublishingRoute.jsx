import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryPublishPanel from "../directories/DirectoryPublishPanel.jsx";

/** Settings › Publishing — DirectoryPublishPanel. Custom domains live on the separate Domain page. */
export default function DirectoryPublishingRoute() {
  const { directory, client, canPublish, recordEvent, refetch } = useDirectory();
  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Publishing</h1>
        </div>
      </div>
      <div className="card card-pad">
        <DirectoryPublishPanel
          directory={directory}
          clientSlug={client?.slug}
          canPublish={canPublish}
          recordEvent={recordEvent}
          onPublished={refetch}
        />
      </div>
    </>
  );
}
