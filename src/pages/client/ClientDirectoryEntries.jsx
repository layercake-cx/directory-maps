import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { canManageOrg } from "../../lib/clientAuth.js";
import { archiveDirectory, deleteDirectoryPermanently, getDirectory } from "../../lib/directories.js";
import DirectoryEntriesPanel from "../../components/directories/DirectoryEntriesPanel.jsx";

export default function ClientDirectoryEntries() {
  const { directoryId } = useParams();
  const navigate = useNavigate();
  const { contact } = useClient();
  const canManage = canManageOrg(contact);

  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [archiving, setArchiving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        setDirectory(await getDirectory(directoryId));
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [directoryId]);

  async function handleArchive() {
    if (!window.confirm(`Archive "${directory?.name}"? It will be hidden from your directories list.`)) return;
    try {
      setArchiving(true);
      await archiveDirectory(directoryId);
      navigate("/client/directories");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    if (deleteText !== "DELETE") return;
    try {
      setDeleting(true);
      await deleteDirectoryPermanently(directoryId);
      navigate("/client/directories");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="page-main"><p>Loading…</p></div>;
  if (err) return <div className="page-main"><p style={{ color: "#b91c1c" }}>{err}</p></div>;
  if (!directory) return <div className="page-main"><p>Directory not found.</p></div>;

  return (
    <div className="page-main">
      <div style={{ marginBottom: 12 }}>
        <Link to="/client/directories">← Back to directories</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{directory.name}</h2>
          {directory.description && <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>{directory.description}</p>}
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={handleArchive} disabled={archiving}>
              {archiving ? "Archiving…" : "Archive"}
            </button>
            <button className="btn" type="button" style={{ color: "#b91c1c" }} onClick={() => { setDeleteOpen(true); setDeleteText(""); }}>
              Delete
            </button>
          </div>
        )}
      </div>

      <DirectoryEntriesPanel directoryId={directoryId} canEdit />

      {deleteOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => setDeleteOpen(false)}
        >
          <div className="panel-section admin-card" style={{ border: "1px solid #b91c1c", maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <p className="panel-section__title" style={{ color: "#b91c1c" }}>Delete "{directory.name}" permanently?</p>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              This removes the directory and all of its entries. This can't be undone.
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13 }}>Type <strong>DELETE</strong> to confirm:</p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="btn" onClick={handleDelete} disabled={deleting || deleteText !== "DELETE"} style={{ color: "#fff", background: "#b91c1c", borderColor: "#b91c1c" }}>
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button type="button" className="btn" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
