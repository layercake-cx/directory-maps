import React from "react";
import { Link } from "react-router-dom";
import logoOnTeal from "../../assets/brand/discover-by-layercake-on-teal.svg";
import logoReversed from "../../assets/brand/discover-by-layercake-reversed.svg";
import WorkspaceSwitcher from "./WorkspaceSwitcher.jsx";
import AvatarMenu from "./AvatarMenu.jsx";
import { ShieldIcon } from "../icons/shellIcons.jsx";
import { MenuIcon } from "../ui/icons.jsx";
import TaskIndicator from "./TaskIndicator.jsx";
import AskPipButton from "./AskPipButton.jsx";

/**
 * Top bar, left to right: Menu button (below 1024px, when the page has a feature panel), Discover by
 * Layercake logo (on teal in the client context, reversed on ink in the platform context), divider,
 * WorkspaceSwitcher, "Staff view" chip (staff in the client context), spacer, TaskIndicator,
 * AskPipButton, AvatarMenu. There is no global search or help link (removed 2026-11-14; see BACKLOG.md).
 * Below 1024px the Menu button opens the feature panel as a drawer (`showMenu`, `menuOpen`, `onMenu`).
 */
export default function TopBar({ context, isStaff, homeHref, orgName, activeClientId, showMenu, menuOpen, onMenu }) {
  return (
    <header className="topbar">
      {showMenu ? (
        <button type="button" className="topbar-menu" aria-label="Menu" aria-expanded={!!menuOpen} aria-controls="shell-panel" onClick={onMenu}>
          <MenuIcon />
          <span>Menu</span>
        </button>
      ) : null}
      <Link to={homeHref} className="topbar-logo">
        <img src={context === "platform" ? logoReversed : logoOnTeal} alt="Discover by Layercake" />
      </Link>
      <div className="topbar-divider" aria-hidden="true" />
      <WorkspaceSwitcher isStaff={isStaff} orgName={orgName} activeClientId={activeClientId} context={context} />
      {context === "client" && isStaff && (
        <span className="staff-chip">
          <ShieldIcon size={12} />
          Staff view
        </span>
      )}
      <div className="topbar-spacer" />
      <TaskIndicator />
      <AskPipButton />
      <AvatarMenu />
    </header>
  );
}
