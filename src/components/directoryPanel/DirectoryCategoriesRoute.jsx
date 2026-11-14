import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import CategorisationAttachmentPicker from "../directories/CategorisationAttachmentPicker.jsx";

/**
 * Content › Categories — chooses which of the client's categories are available for use on this
 * directory's entries (attachment + ordering). Terms are applied to individual entries from the
 * entry editor's Categories tab or bulk tagging; the directory itself is not tagged with terms.
 */
export default function DirectoryCategoriesRoute() {
  const { directoryId, clientId, canManage, recordEvent, isAdminView } = useDirectory();
  // There is no per-category route yet, so "Edit terms" opens the client's Categories list (BACKLOG).
  const editTermsHref = isAdminView ? `/admin/clients/${encodeURIComponent(clientId)}/categorisations` : "/client/categorisations";

  return (
    <CategorisationAttachmentPicker
      layout="page"
      clientId={clientId}
      targetType="directory"
      targetId={directoryId}
      recordEvent={recordEvent}
      canManage={canManage}
      editTermsHref={editTermsHref}
    />
  );
}
