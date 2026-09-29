import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/layercake-maps-white.png";
import WorkspaceSwitcher from "./WorkspaceSwitcher.jsx";
import AvatarMenu from "./AvatarMenu.jsx";
import { SearchIcon, SupportIcon, ShieldIcon } from "../icons/shellIcons.jsx";

/**
 * Top bar: logo, WorkspaceSwitcher, global search (non-functional placeholder in Phase 1 —
 * see BACKLOG.md), support link, avatar menu. Shows the "Staff view" chip when
 * context=client && isStaff.
 */
export default function TopBar({ context, isStaff, homeHref, orgName, activeClientId }) {
  return (
    <header className="topbar">
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
      <a href="#" className="topbar-icon" aria-label="Support and documentation">
        <SupportIcon />
      </a>
      <AvatarMenu />
    </header>
  );
}
