import React from "react";
import { Outlet, useParams } from "react-router-dom";
import AdminLayout from "./AdminLayout.jsx";
import DirectoryFeaturePanel from "../../components/shell/DirectoryFeaturePanel.jsx";
import DirectoryAccessGuard from "../../components/shell/DirectoryAccessGuard.jsx";
import { DirectoryProvider } from "../../context/DirectoryContext.jsx";

/**
 * Route-only parent for /admin/clients/:clientId/directories/:directoryId/... — the one nested
 * admin route subtree introduced in Phase 2 (every other admin route stays flat, wrapping its
 * own <AdminLayout> as before; see AdminLayout.jsx's own comment on why that broader
 * restructuring was skipped). Pages under this one route stop self-wrapping in <AdminLayout>.
 */
export default function AdminDirectoryPanelLayout() {
  const { clientId, directoryId } = useParams();
  return (
    <DirectoryProvider directoryId={directoryId} clientId={clientId} isAdminView>
      <AdminLayout panel={<DirectoryFeaturePanel />}>
        <DirectoryAccessGuard>
          <Outlet />
        </DirectoryAccessGuard>
      </AdminLayout>
    </DirectoryProvider>
  );
}
