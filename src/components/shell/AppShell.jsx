import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "../../styles/admin-shell-tokens.css";
import "../../styles/admin-shell.css";
import "../../styles/discover-ui.css";
import TopBar from "./TopBar.jsx";
import Rail from "./Rail.jsx";
import { ToastProvider, ConfirmProvider } from "../ui/index.js";
import { JobsProvider } from "../jobs/index.js";
import AssistantProvider from "../assistant/AssistantProvider.jsx";
import { useAuth } from "../../hooks/useAuth.js";

/**
 * Three-layer navigation shell: TopBar + icon Rail + optional FeaturePanel + <main>.
 * `context`: "client" | "platform". `isStaff`: Layercake staff (profiles.role === "admin").
 * `panel`: optional FeaturePanel element for pages with feature-level navigation. Below 1024px the
 * panel becomes a drawer opened by the TopBar's Menu button; it closes on navigation, Esc or a scrim click.
 */
export default function AppShell({ context, isStaff, homeHref, orgName, activeClientId, contact, panel, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const firstName = contact?.first_name || user?.user_metadata?.first_name || null;

  // Navigating closes the drawer (the page that now shows is the answer to the menu choice).
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="shell" data-context={context} data-staff={isStaff ? "true" : "false"}>
      <ToastProvider>
        <ConfirmProvider>
          <JobsProvider>
            <AssistantProvider context={context} isStaff={isStaff} orgName={orgName} activeClientId={activeClientId} contact={contact} userId={user?.id} firstName={firstName}>
          <TopBar
            context={context}
            isStaff={isStaff}
            homeHref={homeHref}
            orgName={orgName}
            activeClientId={activeClientId}
            showMenu={!!panel}
            menuOpen={navOpen}
            onMenu={() => setNavOpen((v) => !v)}
          />
          <div className="shell-body">
            <Rail context={context} isStaff={isStaff} contact={contact} clientId={activeClientId} />
            {panel ? (
              <div className="panel-slot" data-open={navOpen ? "true" : "false"}>
                {panel}
              </div>
            ) : null}
            {panel && navOpen ? <div className="panel-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" /> : null}
            <main className={panel ? "main" : "main main--wide"}>{children}</main>
          </div>
            </AssistantProvider>
          </JobsProvider>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
