import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import CategoryTagPicker from "../directories/CategoryTagPicker.jsx";
import CategorisationAttachmentPicker from "../directories/CategorisationAttachmentPicker.jsx";
import { Section, SettingsLayout } from "../ui/index.js";

/**
 * Content › Categories — CategoryTagPicker + CategorisationAttachmentPicker, relocated here from
 * inside the old "settings" tab (Phase 2; they had no real connection to the entries table
 * despite nav.config.json describing them as living "above the entries table" — see plan doc).
 */
export default function DirectoryCategoriesRoute() {
  const { directoryId, clientId, canManage, recordEvent, directoryTermIds, savingTerms, handleDirectoryTermsChange } =
    useDirectory();

  return (
    <SettingsLayout head={{ title: "Categories" }}>
      <CategorisationAttachmentPicker
        clientId={clientId}
        targetType="directory"
        targetId={directoryId}
        recordEvent={recordEvent}
        canManage={canManage}
      />

      <Section title="Directory categories" description={savingTerms ? "Saving…" : undefined}>
        <CategoryTagPicker
          directoryId={directoryId}
          selectedTermIds={directoryTermIds}
          onChange={canManage ? handleDirectoryTermsChange : () => {}}
        />
      </Section>
    </SettingsLayout>
  );
}
