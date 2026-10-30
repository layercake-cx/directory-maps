import React from "react";
import EntryPagesPage from "../experience/EntryPagesPage.jsx";
import RequireManage from "./RequireManage.jsx";

/** Experience › Entry pages — section order, headings and templates for entry pages. */
export default function DirectoryEntryPagesRoute() {
  return (
    <RequireManage>
      <EntryPagesPage />
    </RequireManage>
  );
}
