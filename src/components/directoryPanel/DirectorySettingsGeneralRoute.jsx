import React, { useState } from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryGeneralSettingsPanel from "../directories/DirectoryGeneralSettingsPanel.jsx";
import ProminentLinksEditor from "../directories/ProminentLinksEditor.jsx";

/**
 * Settings › General. Directory-level chrome that used to sit outside the tabs entirely
 * (Archive/Delete + its confirm modal) moves here, into a "more" menu, per the brief: "Archive
 * and Delete in the page's 'more' menu". Prominent Links stays reachable here too, unchanged,
 * per the IA's explicit instruction (its own nav treatment is still undecided — BACKLOG.md).
 */
export default function DirectorySettingsGeneralRoute() {
  const {
    directory,
    directoryId,
    canManage,
    recordEvent,
    refetch,
    linkedMaps,
    archiving,
    deleting,
    deleteOpen,
    setDeleteOpen,
    deleteText,
    setDeleteText,
    handleArchive,
    handleDelete,
  } = useDirectory();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", position: "relative" }}>
          {canManage && (
            <div>
              <button type="button" className="btn" onClick={() => setMoreOpen((o) => !o)} aria-haspopup="true" aria-expanded={moreOpen}>
                ⋯
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#fff",
                    border: "1px solid var(--lc-border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                    zIndex: 10, minWidth: 160,
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    style={{ display: "block", width: "100%", border: 0, textAlign: "left" }}
                    onClick={() => { setMoreOpen(false); handleArchive(); }}
                    disabled={archiving}
                  >
                    {archiving ? "Archiving…" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ display: "block", width: "100%", border: 0, textAlign: "left", color: "#b91c1c" }}
                    onClick={() => { setMoreOpen(false); setDeleteOpen(true); setDeleteText(""); }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <DirectoryGeneralSettingsPanel
          directory={directory}
          directoryId={directoryId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      </div>

      {canManage && (
        <div className="admin-card">
          <ProminentLinksEditor directoryId={directoryId} recordEvent={recordEvent} title="Prominent links (directory homepage)" />
        </div>
      )}

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
    </>
  );
}
