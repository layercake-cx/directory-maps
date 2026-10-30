import React from "react";
import LookAndFeelPage from "../experience/LookAndFeelPage.jsx";
import RequireManage from "./RequireManage.jsx";

/** Experience › Look & feel — site-wide theme plus header/hero/footer, with a live preview. */
export default function DirectoryLookAndFeelRoute() {
  return (
    <RequireManage>
      <LookAndFeelPage />
    </RequireManage>
  );
}
