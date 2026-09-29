import React from "react";
import "../../styles/admin-shell-tokens.css";
import "../../styles/admin-shell.css";
import TopBar from "./TopBar.jsx";
import Rail from "./Rail.jsx";

/**
 * Three-layer navigation shell: TopBar + icon Rail + optional FeaturePanel + <main>.
 * `context`: "client" | "platform". `isStaff`: Layercake staff (profiles.role === "admin").
 * `panel`: optional FeaturePanel element for pages with feature-level navigation.
 */
export default function AppShell({ context, isStaff, homeHref, orgName, activeClientId, contact, panel, children }) {
  return (
    <div className="shell" data-context={context} data-staff={isStaff ? "true" : "false"}>
      <TopBar context={context} isStaff={isStaff} homeHref={homeHref} orgName={orgName} activeClientId={activeClientId} />
      <div className="shell-body">
        <Rail context={context} isStaff={isStaff} contact={contact} />
        {panel}
        <main className={panel ? "main" : "main main--wide"}>{children}</main>
      </div>
    </div>
  );
}
