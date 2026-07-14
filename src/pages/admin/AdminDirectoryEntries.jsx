import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { archiveDirectory, deleteDirectoryPermanently, getDirectory } from "../../lib/directories.js";
import DirectoryEntriesPanel from "../../components/directories/DirectoryEntriesPanel.jsx";

export default function AdminDirectoryEntries() {
  const { clientId, directoryId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
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
        const [{ data: c }, d] = await Promise.all([
          supabase.from("clients").select("id,name,slug").eq("id", clientId).single(),
          getDirectory(directoryId),
        ]);
        setClient(c);
        setDirectory(d);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, directoryId]);

  async function handleArchive() {
    if (!window.confirm(`Archive "${directory?.name}"? It will be hidden from this customer's directories list.`)) return;
    try {
      setArchiving(true);
      await archiveDirectory(directoryId);
      navigate(`/admin/clients/${encodeURIComponent(clientId)}`);
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
      navigate(`/admin/clients/${encodeURIComponent(clientId)}`);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: directory?.name ?? "…" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        {loading ? (
          <p>Loading…</p>
        ) : err ? (
          <p style={{ color: "#b91c1c" }}>{err}</p>
        ) : !directory ? (
          <p>Directory not found.</p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>← Back to customer</Link>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{directory.name}</h2>
                {directory.description && <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>{directory.description}</p>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" type="button" onClick={handleArchive} disabled={archiving}>
                  {archiving ? "Archiving…" : "Archive"}
                </button>
                <button className="btn" type="button" style={{ color: "#b91c1c" }} onClick={() => { setDeleteOpen(true); setDeleteText(""); }}>
                  Delete
                </button>
              </div>
            </div>

            <DirectoryEntriesPanel directoryId={directoryId} canEdit />
          </>
        )}
      </div>

      {deleteOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => setDeleteOpen(false)}
        >
          <div className="panel-section admin-card" style={{ border: "1px solid #b91c1c", maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <p className="panel-section__title" style={{ color: "#b91c1c" }}>Delete "{directory?.name}" permanently?</p>
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
    </AdminLayout>
  );
}
