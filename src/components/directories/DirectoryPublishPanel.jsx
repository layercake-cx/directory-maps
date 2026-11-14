import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Callout, useConfirm } from "../ui/index.js";
import { JobCard, useJob } from "../jobs/index.js";
import { listCategorisations } from "../../lib/categorisations";
import {
  buildDirectoryPublicationConfig,
  listDirectoryPublications,
  publishDirectory,
  rollbackDirectoryTo,
  triggerDirectorySiteRegeneration,
} from "../../lib/directoryPublications";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/**
 * Publish a directory — DIR-E2. The only caller of publish_directory/
 * rollback_directory_to/generate_directory_site anywhere in the app; before
 * this component, that whole pipeline (Phase 3a/3b) was unreachable.
 * Modelled on ClientMapDashboard.jsx's Publish tab, but much simpler — a
 * directory currently has no theme/branding to snapshot (Phase 4), so the
 * config is just directory settings + the categorisation taxonomy.
 */
export default function DirectoryPublishPanel({ directory, clientSlug, canPublish, recordEvent, onPublished }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [note, setNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const { pathname } = useLocation();
  // Generation status, progress and the leave-the-page hint all live in the job (JobsProvider polls the server).
  const { job, running, begin, refresh, dismiss } = useJob("publish", directory?.id, { href: pathname, version: history[0]?.version });

  function handleGenerationResult(result) {
    if (result?.skipped === "flag_disabled") {
      setErr(
        "Published, but the public pages weren't generated: the Directories feature isn't enabled for this client yet. " +
        "Ask an admin to enable it under Feature access (beta) on the customer's detail page, then publish again.",
      );
    } else if (result?.skipped) {
      setErr(`Published, but page generation was skipped (${result.skipped}). Ask an admin to check the customer's plan/entitlements, then publish again.`);
    } else if (result?.error) {
      setErr(`Published, but page generation failed: ${result.error}`);
    } else {
      setErr("");
    }
  }

  const refreshHistory = useCallback(async () => {
    if (!directory?.id) return;
    try {
      setLoadingHistory(true);
      setHistory(await listDirectoryPublications(directory.id));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [directory?.id]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  async function handlePublish() {
    setErr("");
    try {
      setPublishing(true);
      const categorisations = directory?.client_id ? await listCategorisations(directory.client_id) : [];
      const config = buildDirectoryPublicationConfig({ directory, categorisations });
      recordEvent?.("directory_publish_requested", { directory_id: directory.id, note_present: !!note.trim() });
      await publishDirectory(directory.id, config, note);
      const fresh = await listDirectoryPublications(directory.id);
      setHistory(fresh);
      begin({ variant: "publish", version: fresh[0]?.version });
      triggerDirectorySiteRegeneration(directory.id, {
        onResult: (result) => { handleGenerationResult(result); void refresh(); },
      });
      recordEvent?.("directory_published", { directory_id: directory.id, note_present: !!note.trim() });
      setNote("");
      onPublished?.();
    } catch (e) {
      recordEvent?.("directory_publish_failed", { directory_id: directory.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function handleRollback(pub) {
    const ok = await confirm({
      title: `Restore version ${pub.version}?`,
      body: "This creates a new version with that snapshot's settings. It doesn't delete anything.",
      confirmLabel: "Restore version",
    });
    if (!ok) return;
    setErr("");
    try {
      setRollingBackId(pub.id);
      await rollbackDirectoryTo(directory.id, pub.id);
      begin({ variant: "restore", version: pub.version });
      triggerDirectorySiteRegeneration(directory.id, {
        scope: "full",
        onResult: (result) => { handleGenerationResult(result); void refresh(); },
      });
      recordEvent?.("directory_publish_rolled_back", { directory_id: directory.id, from_publication_id: directory.current_publication_id, to_publication_id: pub.id });
      await refreshHistory();
      onPublished?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRollingBackId(null);
    }
  }

  const publicUrl = directory?.published_at && clientSlug && directory?.slug
    ? `https://maps.layercake-cx.biz/directories/${clientSlug}/${directory.slug}`
    : null;

  async function handleRegenerate() {
    setErr("");
    begin({ variant: "regenerate" });
    triggerDirectorySiteRegeneration(directory.id, {
      onResult: (result) => { handleGenerationResult(result); void refresh(); },
    });
  }

  const pausedReason = running ? `Publishing is paused until ${job?.variant === "regenerate" ? "pages are rebuilt" : history[0]?.version ? `version ${history[0].version} is live` : "this run finishes"}.` : undefined;

  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Publish</p>

      {directory?.published_at ? (
        <p style={{ fontSize: 13, margin: "0 0 8px" }}>
          Published {new Date(directory.published_at).toLocaleString()}.{" "}
          {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer">View public page</a>}
        </p>
      ) : (
        <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 8px" }}>Not published yet.</p>
      )}

      {job ? (
        <div style={{ margin: "0 0 12px" }}>
          <JobCard
            job={job}
            onRetry={handleRegenerate}
            onDismiss={dismiss}
            askPip={{ question: "Can I undo a publish?" }}
            primaryAction={publicUrl ? <Button as="a" href={publicUrl} target="_blank" rel="noopener noreferrer">View live site</Button> : null}
          />
        </div>
      ) : null}

      {err ? <div style={{ margin: "0 0 12px" }}><Callout tone="danger">{err}</Callout></div> : null}

      {canPublish && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, maxWidth: 280 }} />
          <Button variant="primary" onClick={handlePublish} loading={publishing} loadingLabel="Publishing…" disabled={running} disabledReason={pausedReason}>
            {directory?.published_at ? "Publish update" : "Publish"}
          </Button>
        </div>
      )}

      {loadingHistory ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading history…</p>
      ) : history.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No publish history yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {history.map((pub) => {
            const isCurrent = pub.id === directory?.current_publication_id;
            return (
              <div key={pub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7, background: isCurrent ? "rgba(74,155,170,0.08)" : "transparent" }}>
                <div style={{ fontSize: 12 }}>
                  <strong>Version {pub.version}</strong>{isCurrent ? " (current)" : ""}
                  <div style={{ opacity: 0.7 }}>{new Date(pub.published_at).toLocaleString()}{pub.note ? ` — ${pub.note}` : ""}</div>
                </div>
                {canPublish && !isCurrent && (
                  <Button size="sm" onClick={() => handleRollback(pub)} loading={rollingBackId === pub.id} loadingLabel="Restoring…" disabled={running} disabledReason={undefined} title={running ? pausedReason : undefined}>
                    Restore
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
