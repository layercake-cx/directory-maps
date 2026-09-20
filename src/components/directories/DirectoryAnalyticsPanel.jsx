import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { analyticsFormFromJson, analyticsJsonEqual, analyticsJsonFromForm, emptyAnalyticsForm } from "../../lib/directoryAnalytics.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };
const hintStyle = { margin: "4px 0 0", fontSize: 11.5, opacity: 0.6 };

/**
 * Directory Settings tab — Analytics & Tracking (GA4 / GTM destinations).
 * Saved on directories.analytics_json; baked into the public site on next Publish.
 */
export default function DirectoryAnalyticsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [form, setForm] = useState(() => analyticsFormFromJson(directory?.analytics_json));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setForm(analyticsFormFromJson(directory?.analytics_json));
  }, [directory]);

  function patch(partial) {
    setForm((f) => ({ ...f, ...partial }));
    setMsg("");
    setErr("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const parsed = analyticsJsonFromForm(form);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    try {
      setSaving(true);
      const prev = directory?.analytics_json ?? null;
      await updateDirectory(directoryId, { analytics_json: parsed.json });
      if (!analyticsJsonEqual(prev, parsed.json)) {
        recordEvent?.("directory_settings_updated", {
          directory_id: directoryId,
          changed_fields: ["analytics_json"],
        });
      }
      setMsg("Analytics settings saved. Republish for tags and the cookie banner to appear on the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canManage;

  return (
    <form onSubmit={handleSave} style={{ display: "grid", gap: 16 }}>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Analytics & Tracking</p>
        <p style={{ margin: "0 0 12px", fontSize: 12, opacity: 0.65 }}>
          Optional Google Analytics 4 and Google Tag Manager IDs for this directory's published pages. Each can be turned on independently. The live site asks visitors for analytics consent before loading Google tags. First-party directory events are still recorded in Directory Maps (no personal data). Changes apply after you Publish.
        </p>
      </div>

      <div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 8, cursor: disabled ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={form.ga4Enabled}
            onChange={(e) => patch({ ga4Enabled: e.target.checked })}
            disabled={disabled}
          />
          Enable Google Analytics 4
        </label>
        <label style={labelStyle}>GA4 Measurement ID</label>
        <input
          value={form.ga4MeasurementId}
          onChange={(e) => patch({ ga4MeasurementId: e.target.value })}
          disabled={disabled}
          placeholder="G-XXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <p style={hintStyle}>From Google Analytics → Admin → Data streams.</p>
      </div>

      <div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 8, cursor: disabled ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={form.gtmEnabled}
            onChange={(e) => patch({ gtmEnabled: e.target.checked })}
            disabled={disabled}
          />
          Enable Google Tag Manager
        </label>
        <label style={labelStyle}>GTM Container ID</label>
        <input
          value={form.gtmContainerId}
          onChange={(e) => patch({ gtmContainerId: e.target.value })}
          disabled={disabled}
          placeholder="GTM-XXXXXXX"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <p style={hintStyle}>From Google Tag Manager → your container. Directory events are pushed to the data layer after consent.</p>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      {canManage && (
        <div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
            {saving ? "Saving…" : "Save analytics"}
          </button>
        </div>
      )}
    </form>
  );
}
