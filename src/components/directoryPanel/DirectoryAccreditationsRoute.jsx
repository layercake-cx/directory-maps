import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import AccreditationSchemesPanel from "../directories/AccreditationSchemesPanel.jsx";
import RequireManage from "./RequireManage.jsx";
import { SettingsLayout } from "../ui/index.js";

export default function DirectoryAccreditationsRoute() {
  const { directoryId, recordEvent } = useDirectory();
  return (
    <SettingsLayout head={{ title: "Accreditations" }}>
      <RequireManage>
        <AccreditationSchemesPanel directoryId={directoryId} recordEvent={recordEvent} />
      </RequireManage>
    </SettingsLayout>
  );
}
