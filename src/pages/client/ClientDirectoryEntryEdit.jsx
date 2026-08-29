import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { canManageOrg } from "../../lib/clientAuth.js";
import { getContactDirectoryPermission } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import DirectoryEntryEditor from "../../components/directories/DirectoryEntryEditor.jsx";

export default function ClientDirectoryEntryEdit({ tab = "basic" }) {
  const { directoryId, entryId } = useParams();
  const { client, contact } = useClient();
  const canManage = canManageOrg(contact);

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "client_portal", clientId: client?.id ?? null });
  }, [client?.id]);

  const [permission, setPermission] = useState(null);
  const [permissionChecked, setPermissionChecked] = useState(false);

  useEffect(() => {
    if (canManage) { setPermissionChecked(true); return; }
    if (!contact?.id || !directoryId) return;
    setPermissionChecked(false);
    getContactDirectoryPermission(contact.id, directoryId)
      .then(setPermission)
      .finally(() => setPermissionChecked(true));
  }, [canManage, contact?.id, directoryId]);

  const directoryPath = `/client/directories/${encodeURIComponent(directoryId)}`;

  if (!permissionChecked) return <div className="page-main"><p>Loading…</p></div>;

  const hasAccess = canManage || !!permission;
  if (!hasAccess) {
    return (
      <div className="page-main">
        <div style={{ marginBottom: 12 }}>
          <Link to={directoryPath}>← Back to directory</Link>
        </div>
        <p>You don't have access to this directory. Ask an Owner or Manager to grant you access.</p>
      </div>
    );
  }
  const canEditEntries = canManage || !!permission?.can_edit_entries;

  return (
    <div className="page-main">
      <DirectoryEntryEditor
        clientId={client?.id}
        directoryId={directoryId}
        entryId={entryId}
        tab={tab}
        canEdit={canEditEntries}
        recordEvent={recordEvent}
        basePath={directoryPath}
        backPath={directoryPath}
        backLabel="Back to directory"
      />
    </div>
  );
}
