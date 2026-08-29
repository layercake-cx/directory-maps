import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import { archiveDirectory, deleteDirectoryPermanently, getDirectory, getMapsLinkedToDirectory } from "../../lib/directories.js";
import { loadDirectoryTermIds, setDirectoryTerms } from "../../lib/categorisations.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import DirectoryEntriesPanel from "../../components/directories/DirectoryEntriesPanel.jsx";
import CategoryTagPicker from "../../components/directories/CategoryTagPicker.jsx";
import AccreditationSchemesPanel from "../../components/directories/AccreditationSchemesPanel.jsx";
import ProminentLinksEditor from "../../components/directories/ProminentLinksEditor.jsx";
import DirectoryPublishPanel from "../../components/directories/DirectoryPublishPanel.jsx";
import DirectoryBrandingPanel from "../../components/directories/DirectoryBrandingPanel.jsx";
import EntryLayoutDesigner from "../../components/directories/EntryLayoutDesigner.jsx";

export default function AdminDirectoryEntries() {
  const { clientId, directoryId } = useParams();
  const navigate = useNavigate();

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "admin_dashboard", clientId });
  }, [clientId]);

  const [client, setClient] = useState(null);
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [archiving, setArchiving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [directoryTermIds, setDirectoryTermIds] = useState([]);
  const [savingTerms, setSavingTerms] = useState(false);
  const [linkedMaps, setLinkedMaps] = useState([]);

  const reloadDirectory = useCallback(async () => {
    try {
      setDirectory(await getDirectory(directoryId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }, [directoryId]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const [{ data: c }] = await Promise.all([
          supabase.from("clients").select("id,name,slug").eq("id", clientId).single(),
          reloadDirectory(),
        ]);
        setClient(c);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, directoryId, reloadDirectory]);

  useEffect(() => {
    loadDirectoryTermIds(directoryId).then(setDirectoryTermIds).catch(() => {});
  }, [directoryId]);

  useEffect(() => {
    getMapsLinkedToDirectory(directoryId).then(setLinkedMaps).catch(() => {});
  }, [directoryId]);

  async function handleDirectoryTermsChange(ids) {
    setDirectoryTermIds(ids);
    try {
      setSavingTerms(true);
      await setDirectoryTerms(directoryId, ids);
      recordEvent("directory_terms_updated", { directory_id: directoryId });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSavingTerms(false);
    }
  }

  async function handleArchive() {
    const publishedLinkedMaps = linkedMaps.filter((m) => m.current_publication_id);
    const warning = linkedMaps.length
      ? `\n\nWarning: ${linkedMaps.length === 1 ? "the map" : "maps"} "${linkedMaps.map((m) => m.name).join('", "')}" use${linkedMaps.length === 1 ? "s" : ""} this directory as ${linkedMaps.length === 1 ? "its" : "their"} live pin source. Archiving does NOT remove ${linkedMaps.length === 1 ? "it" : "them"} from public view` +
        (publishedLinkedMaps.length ? ` — ${publishedLinkedMaps.length === 1 ? "it is" : "they are"} published and will keep showing this directory's data. Archive or delete the map itself to remove it from public view.` : ".")
      : "";
    if (!window.confirm(`Archive "${directory?.name}"? It will be hidden from this customer's directories list.${warning}`)) return;
    try {
      setArchiving(true);
      await archiveDirectory(directoryId);
      recordEvent("directory_archived", { directory_id: directoryId, name: directory?.name });
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
      recordEvent("directory_deleted", { directory_id: directoryId, name: directory?.name });
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

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
                Categorisations {savingTerms ? <span style={{ fontWeight: 400, opacity: 0.6 }}>(saving…)</span> : null}
              </p>
              <CategoryTagPicker
                clientId={clientId}
                scope="directory"
                selectedTermIds={directoryTermIds}
                onChange={handleDirectoryTermsChange}
              />
            </div>

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <DirectoryPublishPanel
                directory={directory}
                clientSlug={client?.slug}
                canPublish
                recordEvent={recordEvent}
                onPublished={reloadDirectory}
              />
            </div>

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Branding</p>
              <DirectoryBrandingPanel
                directory={directory}
                directoryId={directoryId}
                canManage
                recordEvent={recordEvent}
                onSaved={reloadDirectory}
              />
            </div>

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Entry layout</p>
              <EntryLayoutDesigner directoryId={directoryId} canManage recordEvent={recordEvent} />
            </div>

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <AccreditationSchemesPanel directoryId={directoryId} recordEvent={recordEvent} />
            </div>

            <div className="admin-card" style={{ marginBottom: 16 }}>
              <ProminentLinksEditor directoryId={directoryId} recordEvent={recordEvent} title="Prominent links (directory homepage)" />
            </div>

            <DirectoryEntriesPanel
              directoryId={directoryId}
              directoryBasePath={`/admin/clients/${encodeURIComponent(clientId)}/directories/${encodeURIComponent(directoryId)}`}
              clientId={clientId}
              canEdit
              recordEvent={recordEvent}
            />
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
            {linkedMaps.length > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: 13, background: "#fef3c7", color: "#92400e", padding: "8px 10px", borderRadius: 6 }}>
                {linkedMaps.length === 1 ? "The map" : "Maps"} "{linkedMaps.map((m) => m.name).join('", "')}" {linkedMaps.length === 1 ? "uses" : "use"} this directory as {linkedMaps.length === 1 ? "its" : "their"} live pin datasource. Deleting the directory removes {linkedMaps.length === 1 ? "its" : "their"} datasource link — {linkedMaps.length === 1 ? "it" : "they"} will revert to being manually-edited data instead of disappearing.
              </p>
            )}
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
