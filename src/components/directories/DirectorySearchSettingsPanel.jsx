import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";

/**
 * Directory Settings tab — Location search.
 * Off by default. Takes effect on the published homepage after the next Publish.
 */
export default function DirectorySearchSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [enabled, setEnabled] = useState(!!directory?.location_search_enabled);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setEnabled(!!directory?.location_search_enabled);
  }, [directory?.location_search_enabled]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const prev = !!directory?.location_search_enabled;
      await updateDirectory(directoryId, { location_search_enabled: enabled });
      if (enabled !== prev) {
        recordEvent?.("directory_settings_updated", {
          directory_id: directoryId,
          changed_fields: ["location_search_enabled"],
        });
      }
      setMsg(enabled
        ? "Location search saved. Publish the directory for Distance from to appear on the live site."
        : "Location search saved. Publish the directory to remove Distance from from the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canManage;

  return (
    <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Search</p>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.65 }}>
          Keyword search is always on. Location search adds a <strong>Distance from</strong> filter on the published homepage, and lets a search such as “ultimate frisbee near Stroud” fill that filter. It applies after you Publish.
        </p>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: disabled ? "default" : "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setMsg("");
            setErr("");
          }}
          disabled={disabled}
          style={{ marginTop: 2 }}
        />
        <span>Location search</span>
      </label>

      {!canManage && (
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change search settings.</p>
      )}

      {canManage && (
        <div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
            {saving ? "Saving…" : "Save search settings"}
          </button>
        </div>
      )}
    </form>
  );
}
