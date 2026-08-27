import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };
const colorRowStyle = { display: "flex", alignItems: "center", gap: 8 };

const DEFAULTS = { primaryColor: "#2563eb", headerBg: "#111827", headerText: "#ffffff", logoUrl: "" };

function themeFromDirectory(directory) {
  const t = directory?.theme_json && typeof directory.theme_json === "object" ? directory.theme_json : {};
  return {
    primaryColor: t.primaryColor || DEFAULTS.primaryColor,
    headerBg: t.headerBg || DEFAULTS.headerBg,
    headerText: t.headerText || DEFAULTS.headerText,
    logoUrl: t.logoUrl || "",
  };
}

/**
 * Directory branding (build-scope §5.1 "Theme: token overrides ... logo").
 * A small, deliberately minimal token set — colours + logo, not the full
 * font/radius/imagery system the brief eventually describes — mirrors what
 * generate_directory_site actually renders (a simple header bar + accent
 * colour on links/buttons), not a full CSS framework. Persists straight to
 * directories.theme_json via the existing generic updateDirectory() patch
 * helper; no dedicated RPC needed since RLS on `directories` already scopes
 * writes to the owning client (directories_own_client policy).
 */
export default function DirectoryBrandingPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [theme, setTheme] = useState(() => themeFromDirectory(directory));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setTheme(themeFromDirectory(directory));
  }, [directory]);

  function set(key, value) {
    setTheme((t) => ({ ...t, [key]: value }));
    setMsg("");
  }

  async function save(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = {
        primaryColor: theme.primaryColor || DEFAULTS.primaryColor,
        headerBg: theme.headerBg || DEFAULTS.headerBg,
        headerText: theme.headerText || DEFAULTS.headerText,
        logoUrl: theme.logoUrl.trim(),
      };
      await updateDirectory(directoryId, { theme_json: next });
      recordEvent?.("directory_branding_updated", { directory_id: directoryId, has_logo: !!next.logoUrl });
      setMsg("Branding saved. Republish for it to appear on the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change branding.</p>;
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Primary colour (links, buttons)</span>
        <div style={colorRowStyle}>
          <input type="color" value={theme.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
          <input value={theme.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} style={inputStyle} />
        </div>
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Header background</span>
        <div style={colorRowStyle}>
          <input type="color" value={theme.headerBg} onChange={(e) => set("headerBg", e.target.value)} />
          <input value={theme.headerBg} onChange={(e) => set("headerBg", e.target.value)} style={inputStyle} />
        </div>
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Header text colour</span>
        <div style={colorRowStyle}>
          <input type="color" value={theme.headerText} onChange={(e) => set("headerText", e.target.value)} />
          <input value={theme.headerText} onChange={(e) => set("headerText", e.target.value)} style={inputStyle} />
        </div>
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Logo URL (optional)</span>
        <input
          type="url"
          value={theme.logoUrl}
          onChange={(e) => set("logoUrl", e.target.value)}
          placeholder="https://yourcompany.com/logo.png"
          style={inputStyle}
        />
      </label>

      <div>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
      </div>
    </form>
  );
}
