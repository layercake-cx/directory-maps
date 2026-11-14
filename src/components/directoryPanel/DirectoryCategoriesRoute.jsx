import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import CategorisationAttachmentPicker from "../directories/CategorisationAttachmentPicker.jsx";
import { SettingsLayout } from "../ui/index.js";

/**
 * Content › Categories — chooses which of the client's categories are available for use on this
 * directory's entries (attachment + ordering). Terms are applied to individual entries from the
 * entry editor's Categories tab or bulk tagging; the directory itself is not tagged with terms.
 */
export default function DirectoryCategoriesRoute() {
  const { directoryId, clientId, canManage, recordEvent } = useDirectory();

  return (
    <SettingsLayout head={{ title: "Categories" }}>
      <CategorisationAttachmentPicker
        clientId={clientId}
        targetType="directory"
        targetId={directoryId}
        recordEvent={recordEvent}
        canManage={canManage}
      />
    </SettingsLayout>
  );
}
