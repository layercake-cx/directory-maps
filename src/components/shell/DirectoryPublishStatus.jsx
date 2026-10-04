import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getDirectoryPublishState } from "../../lib/directoryPublications.js";

const LABELS = {
  not_published: "Not published",
  generating: "Publishing…",
  failed: "Publishing failed",
  published: "Published",
  changes: "Unpublished changes",
};

/**
 * Publish status chip shown under the directory title in the side panel: green = live and
 * up to date, amber = live but edited since, red = last generation failed, grey = never
 * published. Links to the Publishing page. Re-checks on every navigation (edits happen on
 * sibling routes) and polls while a generation is running.
 */
export default function DirectoryPublishStatus({ directoryId, publishingRoute, publishedAtKey }) {
  const { pathname } = useLocation();
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!directoryId) return;
    try {
      setStatus(await getDirectoryPublishState(directoryId));
    } catch {
      /* non-fatal: chip just stays hidden/stale */
    }
  }, [directoryId]);

  useEffect(() => { void load(); }, [load, pathname, publishedAtKey]);

  useEffect(() => {
    if (status?.state !== "generating") return undefined;
    const id = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(id);
  }, [status?.state, load]);

  if (!status) return null;
  const { state, changeCount, publishedAt } = status;
  const detail =
    state === "changes" ? "Review and publish" :
    state === "published" && publishedAt ? `Live since ${new Date(publishedAt).toLocaleDateString()}` :
    state === "not_published" ? "Go to Publishing" :
    state === "failed" ? "See details" : null;

  return (
    <Link to={publishingRoute} className="publish-status" data-state={state} title={changeCount ? `${changeCount} item${changeCount === 1 ? "" : "s"} changed since the last publish` : undefined}>
      <span className="publish-status-dot" aria-hidden="true" />
      <span className="publish-status-text">
        <strong>{LABELS[state]}</strong>
        {detail && <span>{detail}</span>}
      </span>
    </Link>
  );
}
