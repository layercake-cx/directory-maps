import React from "react";
import BlockLibraryPage from "../blocks/BlockLibraryPage.jsx";
import RequireManage from "./RequireManage.jsx";

/** Experience › Page blocks — the directory's library of block templates. Owners and Managers only. */
export default function DirectoryBlockLibraryRoute() {
  return (
    <RequireManage>
      <BlockLibraryPage />
    </RequireManage>
  );
}
