import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import CategoryTagPicker from "../directories/CategoryTagPicker.jsx";
import CategorisationAttachmentPicker from "../directories/CategorisationAttachmentPicker.jsx";

/**
 * Content › Categories — CategoryTagPicker + CategorisationAttachmentPicker, relocated here from
 * inside the old "settings" tab (Phase 2; they had no real connection to the entries table
 * despite nav.config.json describing them as living "above the entries table" — see plan doc).
 */
export default function DirectoryCategoriesRoute() {
  const { directoryId, clientId, canManage, recordEvent, directoryTermIds, savingTerms, handleDirectoryTermsChange } =
    useDirectory();

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <CategorisationAttachmentPicker
          clientId={clientId}
          targetType="directory"
          targetId={directoryId}
          recordEvent={recordEvent}
          canManage={canManage}
        />
      </div>

      <div className="card card-pad">
        <p className="card-title">
          Categorisations {savingTerms ? <span style={{ fontWeight: 400, opacity: 0.6 }}>(saving…)</span> : null}
        </p>
        <CategoryTagPicker
          directoryId={directoryId}
          selectedTermIds={directoryTermIds}
          onChange={canManage ? handleDirectoryTermsChange : () => {}}
        />
      </div>
    </>
  );
}
