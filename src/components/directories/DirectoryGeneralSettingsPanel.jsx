import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };
const sectionTitleStyle = { margin: "0 0 8px", fontSize: 13, fontWeight: 600 };

/**
 * Directory Settings › General — title + home nav label.
 * Split from the SEO half (now DirectorySeoSettingsPanel.jsx) for the admin shell redesign's
 * Settings › General vs. Settings › SEO nav split (Phase 2) — same fields/save call as before,
 * just its own independent form/save button instead of sharing one with the SEO fields.
 */
export default function DirectoryGeneralSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [name, setName] = useState(directory?.name || "");
  const [homeNavLabel, setHomeNavLabel] = useState(directory?.home_nav_label || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(directory?.name || "");
    setHomeNavLabel(directory?.home_nav_label || "");
  }, [directory]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const cleanName = name.trim();
    if (!cleanName) {
      setErr("Directory title is required.");
      return;
    }
    try {
      setSaving(true);
      const cleanHomeNav = homeNavLabel.trim();
      const changedFields = [];
      if (cleanName !== (directory?.name || "")) changedFields.push("name");
      if (cleanHomeNav !== (directory?.home_nav_label || "")) changedFields.push("home_nav_label");

      await updateDirectory(directoryId, {
        name: cleanName,
        home_nav_label: cleanHomeNav || null,
      });
      if (changedFields.length) {
        recordEvent?.("directory_settings_updated", { directory_id: directoryId, changed_fields: changedFields });
      }
      setMsg("Settings saved. Republish for changes to appear on the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canManage;

  return (
    <form onSubmit={handleSave} style={{ display: "grid", gap: 20 }}>
      <div>
        <p style={sectionTitleStyle}>General settings</p>
        <label style={labelStyle}>Directory title</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setMsg(""); }} disabled={disabled} style={inputStyle} />
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Home navigation label</label>
          <input
            value={homeNavLabel}
            onChange={(e) => { setHomeNavLabel(e.target.value); setMsg(""); }}
            disabled={disabled}
            placeholder="Home"
            style={inputStyle}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11.5, opacity: 0.6 }}>
            Label for the directory landing page in the site header, mobile menu, breadcrumbs, and footer. Leave blank to use “Home”.
          </p>
        </div>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      {canManage && (
        <div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </form>
  );
}
