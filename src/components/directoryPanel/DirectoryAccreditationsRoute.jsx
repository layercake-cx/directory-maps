import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import AccreditationSchemesPanel from "../directories/AccreditationSchemesPanel.jsx";
import RequireManage from "./RequireManage.jsx";

export default function DirectoryAccreditationsRoute() {
  const { directoryId, recordEvent } = useDirectory();
  return (
    <RequireManage>
      <div className="card card-pad">
        <AccreditationSchemesPanel directoryId={directoryId} recordEvent={recordEvent} />
      </div>
    </RequireManage>
  );
}
