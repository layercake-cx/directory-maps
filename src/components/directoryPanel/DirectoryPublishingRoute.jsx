import React from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryPublishPanel from "../directories/DirectoryPublishPanel.jsx";

/**
 * Settings › Domain & Publishing — DirectoryPublishPanel moved in unchanged. `DomainSettings.jsx`
 * has no per-directory mode today (see BACKLOG.md "per-directory Domain & Publishing view"), so
 * this links out to the existing client-level Domains page rather than embedding a directory-
 * scoped domain widget that doesn't exist yet.
 */
export default function DirectoryPublishingRoute() {
  const { directory, client, canPublish, recordEvent, refetch, domainsHref, isAdminView } = useDirectory();
  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <DirectoryPublishPanel
          directory={directory}
          clientSlug={client?.slug}
          canPublish={canPublish}
          recordEvent={recordEvent}
          onPublished={refetch}
        />
      </div>
      <div className="card card-pad">
        <p style={{ margin: 0, fontSize: 13 }}>
          <Link to={domainsHref}>
            {isAdminView ? "Manage this customer's domains →" : "Manage custom domains →"}
          </Link>
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.6 }}>
          A directory-scoped domain view isn't built yet — see BACKLOG.md.
        </p>
      </div>
    </>
  );
}
