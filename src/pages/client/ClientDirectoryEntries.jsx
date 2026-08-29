import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { canManageOrg } from "../../lib/clientAuth.js";
import { archiveDirectory, deleteDirectoryPermanently, getContactDirectoryPermission, getDirectory, getMapsLinkedToDirectory } from "../../lib/directories.js";
import { loadDirectoryTermIds, setDirectoryTerms } from "../../lib/categorisations.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import DirectoryEntriesPanel from "../../components/directories/DirectoryEntriesPanel.jsx";
import CategoryTagPicker from "../../components/directories/CategoryTagPicker.jsx";
import CategorisationAttachmentPicker from "../../components/directories/CategorisationAttachmentPicker.jsx";
import AccreditationSchemesPanel from "../../components/directories/AccreditationSchemesPanel.jsx";
import ProminentLinksEditor from "../../components/directories/ProminentLinksEditor.jsx";
import DirectoryPublishPanel from "../../components/directories/DirectoryPublishPanel.jsx";
import DirectoryBrandingPanel from "../../components/directories/DirectoryBrandingPanel.jsx";
import EntryLayoutDesigner from "../../components/directories/EntryLayoutDesigner.jsx";

export default function ClientDirectoryEntries() {
  const { directoryId } = useParams();
  const navigate = useNavigate();
  const { client, contact } = useClient();
  const canManage = canManageOrg(contact);

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "client_portal", clientId: client?.id ?? null });
  }, [client?.id]);

  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Member-level access (DIR-E1-S2): Owner/Manager always have access; a Member
  // needs an explicit contact_directory_permissions grant.
  const [permission, setPermission] = useState(null);
  const [permissionChecked, setPermissionChecked] = useState(false);

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
        await reloadDirectory();
      } finally {
        setLoading(false);
      }
    })();
  }, [directoryId, reloadDirectory]);

  useEffect(() => {
    loadDirectoryTermIds(directoryId).then(setDirectoryTermIds).catch(() => {});
  }, [directoryId]);

  useEffect(() => {
    getMapsLinkedToDirectory(directoryId).then(setLinkedMaps).catch(() => {});
  }, [directoryId]);

  useEffect(() => {
    if (canManage) { setPermissionChecked(true); return; }
    if (!contact?.id || !directoryId) return;
    setPermissionChecked(false);
    getContactDirectoryPermission(contact.id, directoryId)
      .then(setPermission)
      .catch((e) => setErr(e?.message ?? String(e)))
      .finally(() => setPermissionChecked(true));
  }, [canManage, contact?.id, directoryId]);

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
    if (!window.confirm(`Archive "${directory?.name}"? It will be hidden from your directories list.${warning}`)) return;
    try {
      setArchiving(true);
      await archiveDirectory(directoryId);
      recordEvent("directory_archived", { directory_id: directoryId, name: directory?.name });
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
      recordEvent("directory_deleted", { directory_id: directoryId, name: directory?.name });
      navigate("/client/directories");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !permissionChecked) return <div className="page-main"><p>Loading…</p></div>;
  if (err) return <div className="page-main"><p style={{ color: "#b91c1c" }}>{err}</p></div>;
  if (!directory) return <div className="page-main"><p>Directory not found.</p></div>;

  const hasAccess = canManage || !!permission;
  if (!hasAccess) {
    return (
      <div className="page-main">
        <div style={{ marginBottom: 12 }}>
          <Link to="/client/directories">← Back to directories</Link>
        </div>
        <p>You don't have access to this directory. Ask an Owner or Manager to grant you access.</p>
      </div>
    );
  }
  const canEditEntries = canManage || !!permission?.can_edit_entries;

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

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <CategorisationAttachmentPicker
          clientId={client?.id}
          targetType="directory"
          targetId={directoryId}
          recordEvent={recordEvent}
          canManage={canManage}
        />
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
          Categorisations {savingTerms ? <span style={{ fontWeight: 400, opacity: 0.6 }}>(saving…)</span> : null}
        </p>
        <CategoryTagPicker
          directoryId={directoryId}
          selectedTermIds={directoryTermIds}
          onChange={canManage ? handleDirectoryTermsChange : () => {}}
        />
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <DirectoryPublishPanel
          directory={directory}
          clientSlug={client?.slug}
          canPublish={canManage}
          recordEvent={recordEvent}
          onPublished={reloadDirectory}
        />
      </div>

      {canManage && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Branding</p>
          <DirectoryBrandingPanel
            directory={directory}
            directoryId={directoryId}
            canManage={canManage}
            recordEvent={recordEvent}
            onSaved={reloadDirectory}
          />
        </div>
      )}

      {canManage && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Entry layout</p>
          <EntryLayoutDesigner directoryId={directoryId} canManage={canManage} recordEvent={recordEvent} />
        </div>
      )}

      {canManage && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <AccreditationSchemesPanel directoryId={directoryId} recordEvent={recordEvent} />
        </div>
      )}

      {canManage && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <ProminentLinksEditor directoryId={directoryId} recordEvent={recordEvent} title="Prominent links (directory homepage)" />
        </div>
      )}

      <DirectoryEntriesPanel
        directoryId={directoryId}
        directoryBasePath={`/client/directories/${encodeURIComponent(directoryId)}`}
        clientId={client?.id}
        canEdit={canEditEntries}
        recordEvent={recordEvent}
      />

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
    </div>
  );
}
