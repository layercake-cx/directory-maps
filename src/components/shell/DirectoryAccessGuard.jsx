import React from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import { ArchivedBanner, ReadOnly } from "../ui/index.js";
import { useArchiveFlow } from "../archive/useArchiveFlow.jsx";
import { useArchivedByName } from "../../lib/archive.js";

/**
 * Wraps every route under a directory's panel (Content/Experience/.../entry editor). Centralizes
 * the loading/error/no-access states every directory tab used to repeat individually.
 */
export default function DirectoryAccessGuard({ children }) {
  const { loading, permissionChecked, error, directory, hasAccess, backHref, canManage, isAdminView, clientId, refetch } = useDirectory();
  const { restore, busyIds } = useArchiveFlow({ entityType: "directory", isStaff: isAdminView, clientId, onChanged: refetch });
  const archivedByName = useArchivedByName(directory?.archived_by);

  if (loading || !permissionChecked) return <p>Loading…</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!directory) return <p>Directory not found.</p>;
  if (!hasAccess) {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <Link to={backHref}>← Back to directories</Link>
        </div>
        <p>You don't have access to this directory. Ask an Owner or Manager to grant you access.</p>
      </div>
    );
  }
  if (directory.is_active === false) {
    return (
      <>
        <ArchivedBanner
          thing="directory"
          archivedAt={directory.archived_at}
          archivedBy={archivedByName}
          onRestore={canManage ? () => restore([directory], "banner") : undefined}
          restoring={busyIds.includes(directory.id)}
        />
        <ReadOnly active>{children}</ReadOnly>
      </>
    );
  }
  return children;
}
