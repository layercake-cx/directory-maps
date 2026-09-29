import React from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";

/**
 * Directory Overview (new — IA §6, the bare directory URL's new default). Minimal stub for
 * Phase 2: the rich version (counts, needs-attention, recent activity, generated file links) is
 * a real, unbuilt gap — see BACKLOG.md "Directory overview page" (size L) — not invented here.
 */
export default function DirectoryOverviewRoute() {
  const { directory, basePath } = useDirectory();

  return (
    <div className="admin-card">
      {directory.description && <p style={{ margin: "0 0 16px", opacity: 0.75 }}>{directory.description}</p>}
      <p style={{ margin: 0 }}>
        <Link to={`${basePath}/entries`}>View entries →</Link>
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.6 }}>
        A fuller overview (publish status, gaps, recent activity) is planned — see BACKLOG.md.
      </p>
    </div>
  );
}
