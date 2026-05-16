import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./ListingSearchDropdown.module.css";

/**
 * @param {{ listings: { id: string, name?: string }[], mapId: string, days: number }} props
 */
export default function ListingSearchDropdown({ listings, mapId, days }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...(listings || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!q) return sorted.slice(0, 12);
    return sorted.filter((l) => (l.name || "").toLowerCase().includes(q)).slice(0, 12);
  }, [listings, query]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goToListing(listingId) {
    setOpen(false);
    setQuery("");
    navigate(`/client/maps/${encodeURIComponent(mapId)}/stats/listings/${encodeURIComponent(listingId)}?days=${days}`);
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} htmlFor="listing-stats-search">
        View listing stats
      </label>
      <input
        id="listing-stats-search"
        type="text"
        className={styles.input}
        placeholder="Search by listing name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <ul className={styles.list} role="listbox">
          {filtered.map((l) => (
            <li key={l.id}>
              <button type="button" className={styles.option} role="option" onMouseDown={() => goToListing(l.id)}>
                {l.name || "—"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && filtered.length === 0 ? (
        <p className={styles.empty}>No listings match.</p>
      ) : null}
    </div>
  );
}
