import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryContentPagesPanel from "../directories/DirectoryContentPagesPanel.jsx";
import RequireManage from "./RequireManage.jsx";
import { PageLayout } from "../ui/index.js";

export default function DirectoryPagesRoute() {
  const { directoryId, canManage, recordEvent } = useDirectory();
  return (
    <PageLayout head={{ title: "Pages" }}>
      <RequireManage>
        <DirectoryContentPagesPanel directoryId={directoryId} canManage={canManage} recordEvent={recordEvent} />
      </RequireManage>
    </PageLayout>
  );
}
