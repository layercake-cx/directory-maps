import React, { useCallback } from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryGeneralSettingsPanel from "../directories/DirectoryGeneralSettingsPanel.jsx";
import ProminentLinksEditor from "../directories/ProminentLinksEditor.jsx";
import { Button, Callout, Dialog, Field, OverflowMenu, Section, SettingsLayout, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Settings › General. Directory-level chrome that used to sit outside the tabs entirely
 * (Archive/Delete + its confirm dialog) moves here, into a "more" menu, per the brief: "Archive
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

  // Stable so the Dialog's focus handling doesn't restart on every keystroke in the confirmation field.
  const closeDelete = useCallback(() => setDeleteOpen(false), [setDeleteOpen]);

  const moreMenu = canManage ? (
    <OverflowMenu
      label="More actions"
      items={[
        { label: archiving ? "Archiving…" : "Archive", onSelect: handleArchive, disabled: archiving },
        { label: "Delete", danger: true, onSelect: () => { setDeleteOpen(true); setDeleteText(""); } },
      ]}
    />
  ) : null;

  return (
    <SettingsLayout head={{ title: "General", actions: moreMenu }}>
      <DirectoryGeneralSettingsPanel
        directory={directory}
        directoryId={directoryId}
        canManage={canManage}
        recordEvent={recordEvent}
        onSaved={refetch}
      />

      {canManage && (
        <Section>
          <ProminentLinksEditor directoryId={directoryId} recordEvent={recordEvent} title="Prominent links (directory homepage)" />
        </Section>
      )}

      {deleteOpen && (
        <Dialog
          title={`Delete "${directory.name}" permanently?`}
          onClose={closeDelete}
          footer={(
            <>
              <Button onClick={closeDelete} disabled={deleting}>Cancel</Button>
              <Button variant="danger-solid" onClick={handleDelete} loading={deleting} loadingLabel="Deleting…" disabled={deleteText !== "DELETE"}>
                Delete permanently
              </Button>
            </>
          )}
        >
          <div className="b1-form">
            <p>This removes the directory and all of its entries. This can&apos;t be undone.</p>
            {linkedMaps.length > 0 && (
              <Callout tone="warn">
                {linkedMaps.length === 1 ? "The map" : "Maps"} "{linkedMaps.map((m) => m.name).join('", "')}" {linkedMaps.length === 1 ? "uses" : "use"} this directory as {linkedMaps.length === 1 ? "its" : "their"} live pin datasource. Deleting the directory removes {linkedMaps.length === 1 ? "its" : "their"} datasource link — {linkedMaps.length === 1 ? "it" : "they"} will revert to being manually-edited data instead of disappearing.
              </Callout>
            )}
            <Field label={<>Type <strong>DELETE</strong> to confirm</>}>
              <TextInput data-autofocus value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" autoComplete="off" />
            </Field>
          </div>
        </Dialog>
      )}
    </SettingsLayout>
  );
}
