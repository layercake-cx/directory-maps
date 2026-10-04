import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import { getDirectoryPanelGroups } from "../../config/navConfig.js";
import FeaturePanel from "./FeaturePanel.jsx";
import DirectoryPublishStatus from "./DirectoryPublishStatus.jsx";

/** Thin FeaturePanel consumer for the directory workspace — reads everything from DirectoryContext. */
export default function DirectoryFeaturePanel() {
  const { directory, basePath, backHref, backLabel, canManage } = useDirectory();

  // No entry-count aggregate on the directories row today — omit rather than fake it
  // (BACKLOG.md's "Entries table Gaps column" work is the natural place to add this).
  const groups = getDirectoryPanelGroups({ basePath, canManage, entriesCount: null });

  return (
    <FeaturePanel
      title={directory?.name ?? "…"}
      backHref={backHref}
      backLabel={backLabel}
      subtitle={
        directory?.id ? (
          <DirectoryPublishStatus
            directoryId={directory.id}
            publishingRoute={`${basePath}/publishing`}
            publishedAtKey={directory.published_at}
          />
        ) : null
      }
      groups={groups}
    />
  );
}
