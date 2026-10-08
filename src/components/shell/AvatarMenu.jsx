import React, { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "../../lib/auth.js";
import { useAuth } from "../../hooks/useAuth.js";

/** Consistent sign-out entry point for the shell, replacing the ~20 ad hoc per-page buttons. */
export default function AvatarMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") close();
    }
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) && !buttonRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, close]);

  const initial = (user?.email?.[0] || "?").toUpperCase();

  return (
    <div className="avatar-menu">
      <button
        ref={buttonRef}
        type="button"
        className="avatar"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initial}
      </button>
      {open && (
        <div ref={menuRef} role="menu" className="avatar-menu-list">
          <button
            type="button"
            role="menuitem"
            className="avatar-menu-item"
            onClick={() => {
              close();
              signOut().catch(() => {});
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
