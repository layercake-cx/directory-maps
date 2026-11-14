import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/layercake-maps-white.png";
import WorkspaceSwitcher from "./WorkspaceSwitcher.jsx";
import AvatarMenu from "./AvatarMenu.jsx";
import { SearchIcon, SupportIcon, ShieldIcon } from "../icons/shellIcons.jsx";
import { MenuIcon } from "../ui/icons.jsx";
import TaskIndicator from "./TaskIndicator.jsx";
import AskPipButton from "./AskPipButton.jsx";

/**
 * Top bar: logo, WorkspaceSwitcher, global search (non-functional placeholder in Phase 1 —
 * see BACKLOG.md), TaskIndicator slot (phase 4), AskPipButton slot (phase 5), support link,
 * avatar menu. Shows the "Staff view" chip when context=client && isStaff. Below 1024px, when the
 * page has a feature panel, a Menu button opens it as a drawer (`showMenu`, `menuOpen`, `onMenu`).
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
        <img src={logo} alt="Layercake Maps" />
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
      <div className="topbar-search">
        <SearchIcon size={16} />
        <input type="search" placeholder="Search" aria-label="Search" disabled />
      </div>
      <TaskIndicator />
      <AskPipButton />
      <a href="#" className="topbar-icon" aria-label="Support and documentation">
        <SupportIcon />
      </a>
      <AvatarMenu />
    </header>
  );
}
