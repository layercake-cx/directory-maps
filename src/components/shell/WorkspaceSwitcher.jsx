import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { ChevronDownIcon, SearchIcon, ShieldIcon, CheckIcon } from "../icons/shellIcons.jsx";

/**
 * Staff-only accessible switcher menu (search, Platform admin item, customer list, "All N
 * customers"). Client users get plain org-name text instead — see brief's IA §3.
 *
 * Phase 1: "shows but may link to existing pages" — the search below is a trivial client-side
 * substring filter over the already-fetched list, no debounce/backend, no recently-viewed
 * (BACKLOG.md).
 */
export default function WorkspaceSwitcher({ isStaff, orgName, activeClientId, context }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState([]);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isStaff || !open || clients.length > 0) return;
    let cancelled = false;
    supabase
      .from("clients")
      .select("id, name, slug, plan_key")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setClients(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaff, open, clients.length]);

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

  if (!isStaff) {
    return (
      <span className="switcher-org-text">
        <span className="switcher-kicker">Organisation</span> {orgName || "…"}
      </span>
    );
  }

  const filtered = query.trim()
    ? clients.filter(
        (c) =>
          c.name?.toLowerCase().includes(query.trim().toLowerCase()) ||
          c.slug?.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : clients;

  return (
    <div className="switcher-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="switcher"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="switcher-kicker">{context === "platform" ? "" : "Organisation"}</span>
        {context === "platform" ? "Platform admin" : orgName || "…"}
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div ref={menuRef} role="dialog" aria-label="Switch workspace" className="switcher-menu">
          <div style={{ position: "relative" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: 12, top: 10 }} />
            <input
              className="switcher-search"
              style={{ paddingLeft: 34, width: "100%" }}
              type="text"
              placeholder="Search customers by name or slug"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <Link to="/admin/clients" className="switcher-platform" onClick={close}>
            <ShieldIcon size={18} />
            Platform admin
          </Link>
          <div className="switcher-list">
            {filtered.map((c) => (
              <Link
                key={c.id}
                to={`/admin/clients/${c.id}`}
                className="switcher-item"
                aria-current={c.id === activeClientId ? "true" : undefined}
                onClick={close}
              >
                <span>{c.name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="switcher-item-plan">{c.plan_key || "Basic"}</span>
                  {c.id === activeClientId && <CheckIcon size={16} />}
                </span>
              </Link>
            ))}
          </div>
          <Link to="/admin/clients" className="switcher-all" onClick={close}>
            All {clients.length} customers
          </Link>
        </div>
      )}
    </div>
  );
}
