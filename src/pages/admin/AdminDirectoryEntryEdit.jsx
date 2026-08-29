import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { getDirectory } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import DirectoryEntryEditor from "../../components/directories/DirectoryEntryEditor.jsx";

export default function AdminDirectoryEntryEdit({ tab = "basic" }) {
  const { clientId, directoryId, entryId } = useParams();
  const [client, setClient] = useState(null);
  const [directory, setDirectory] = useState(null);

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "admin_dashboard", clientId });
  }, [clientId]);

  useEffect(() => {
    supabase.from("clients").select("id,name,slug").eq("id", clientId).single()
      .then(({ data }) => setClient(data))
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    getDirectory(directoryId).then(setDirectory).catch(() => {});
  }, [directoryId]);

  const directoryPath = `/admin/clients/${encodeURIComponent(clientId)}/directories/${encodeURIComponent(directoryId)}`;

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: directory?.name ?? "…", path: directoryPath },
        { label: "Edit entry" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <DirectoryEntryEditor
        clientId={clientId}
        directoryId={directoryId}
        entryId={entryId}
        tab={tab}
        canEdit
        recordEvent={recordEvent}
        basePath={directoryPath}
        backPath={directoryPath}
        backLabel="Back to directory"
      />
    </AdminLayout>
  );
}
