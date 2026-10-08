import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { getRecentCustomerIds } from "../../lib/recentCustomers.js";
import { ChevronDownIcon, SearchIcon, ShieldIcon, CheckIcon } from "../icons/shellIcons.jsx";

/**
 * Staff-only accessible switcher menu (search, Platform admin item, customer list, "All N
 * customers"). Client users get plain org-name text instead — see brief's IA §3.
 *
 * Phase 3: adds a "Recently viewed" section (Phase 1 backlogged this — see recentCustomers.js).
 * Search stays a trivial client-side substring filter over the already-fetched list.
 */
export default function WorkspaceSwitcher({ isStaff, orgName, activeClientId, context }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState([]);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    // Fetch eagerly (not just on open) when a specific client is being viewed, so the button's
    // own label can resolve that client's name without requiring the menu to be opened first.
    if (!isStaff || clients.length > 0 || (!open && !activeClientId)) return;
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
  }, [isStaff, open, activeClientId, clients.length]);

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

  const activeClient = clients.find((c) => c.id === activeClientId);
  const displayName = orgName || activeClient?.name;

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

  const recent = !query.trim()
    ? getRecentCustomerIds()
        .map((id) => clients.find((c) => c.id === id))
        .filter(Boolean)
    : [];

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
        {context === "platform" ? "Platform admin" : displayName || "…"}
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
          {recent.length > 0 && (
            <>
              <p className="nav-group-label" style={{ margin: "8px 4px 2px" }}>Recently viewed</p>
              <div className="switcher-list" style={{ marginBottom: 8 }}>
                {recent.map((c) => (
                  <Link
                    key={`recent-${c.id}`}
                    to={`/admin/clients/${c.id}`}
                    className="switcher-item"
                    aria-current={c.id === activeClientId ? "true" : undefined}
                    onClick={close}
                  >
                    <span>{c.name}</span>
                    {c.id === activeClientId && <CheckIcon size={16} />}
                  </Link>
                ))}
              </div>
            </>
          )}
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
