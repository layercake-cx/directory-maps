import React from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";

/**
 * Wraps every route under a directory's panel (Content/Experience/.../entry editor). Centralizes
 * the loading/error/no-access states every directory tab used to repeat individually.
 */
export default function DirectoryAccessGuard({ children }) {
  const { loading, permissionChecked, error, directory, hasAccess, backHref } = useDirectory();

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
  return children;
}
