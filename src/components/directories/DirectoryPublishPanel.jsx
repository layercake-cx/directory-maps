import React, { useCallback, useEffect, useState } from "react";
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
  const [msg, setMsg] = useState("");

  function handleGenerationResult(successMsg, result) {
    if (result?.skipped === "flag_disabled") {
      setMsg("");
      setErr(
        "Published, but the public pages weren't generated: the Directories feature isn't enabled for this client yet. " +
        "Ask an admin to enable it under Feature access (beta) on the customer's detail page, then publish again.",
      );
    } else if (result?.skipped) {
      setMsg("");
      setErr(`Published, but page generation was skipped (${result.skipped}). Ask an admin to check the customer's plan/entitlements, then publish again.`);
    } else if (result?.error) {
      setMsg("");
      setErr(`Published, but page generation failed: ${result.error}`);
    } else {
      setErr("");
      setMsg(successMsg);
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
    setMsg("");
    try {
      setPublishing(true);
      const categorisations = directory?.client_id ? await listCategorisations(directory.client_id) : [];
      const config = buildDirectoryPublicationConfig({ directory, categorisations });
      recordEvent?.("directory_publish_requested", { directory_id: directory.id, note_present: !!note.trim() });
      await publishDirectory(directory.id, config, note);
      triggerDirectorySiteRegeneration(directory.id, {
        onResult: (result) => handleGenerationResult("Published and public pages generated.", result),
      });
      recordEvent?.("directory_published", { directory_id: directory.id, note_present: !!note.trim() });
      setNote("");
      setMsg("Published — generating public pages…");
      await refreshHistory();
      onPublished?.();
    } catch (e) {
      recordEvent?.("directory_publish_failed", { directory_id: directory.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function handleRollback(pub) {
    if (!window.confirm(`Restore version ${pub.version}? This creates a new version with that snapshot's settings — it doesn't delete anything.`)) return;
    setErr("");
    setMsg("");
    try {
      setRollingBackId(pub.id);
      await rollbackDirectoryTo(directory.id, pub.id);
      triggerDirectorySiteRegeneration(directory.id, {
        onResult: (result) => handleGenerationResult(`Restored version ${pub.version} and regenerated public pages.`, result),
      });
      recordEvent?.("directory_publish_rolled_back", { directory_id: directory.id, from_publication_id: directory.current_publication_id, to_publication_id: pub.id });
      setMsg(`Restored version ${pub.version} — regenerating public pages…`);
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

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
      {msg && <p style={{ color: "#166534", fontSize: 12, margin: "0 0 8px" }}>{msg}</p>}

      {canPublish && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, maxWidth: 280 }} />
          <button type="button" className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publishing…" : directory?.published_at ? "Publish update" : "Publish"}
          </button>
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
                  <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => handleRollback(pub)} disabled={rollingBackId === pub.id}>
                    {rollingBackId === pub.id ? "Restoring…" : "Restore"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
