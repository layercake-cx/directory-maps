import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/**
 * Directory-level AI intent-driven search — the directory-entry successor to
 * the removed map-level "Ask AI" search (docs/FEATURES.md §4.4d). One admin
 * prompt per directory, mirroring DirectoryAiContentPanel's convention
 * (blank = off), used by the directory_ai_search Edge Function to resolve a
 * visitor's free-text query against this directory's entries. The published
 * search box falls back to plain keyword matching automatically whenever
 * this isn't configured, so leaving it blank is always safe.
 */
export default function DirectoryAiSearchPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [prompt, setPrompt] = useState(directory?.ai_search_prompt ?? "");
  const [webEnabled, setWebEnabled] = useState(!!directory?.ai_search_web_enabled);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPrompt(directory?.ai_search_prompt ?? "");
    setWebEnabled(!!directory?.ai_search_web_enabled);
  }, [directory?.ai_search_prompt, directory?.ai_search_web_enabled]);

  async function savePrompt(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = prompt.trim() || null;
      const webChanged = webEnabled !== !!directory?.ai_search_web_enabled;
      await updateDirectory(directoryId, { ai_search_prompt: next, ai_search_web_enabled: webEnabled });
      recordEvent?.("directory_ai_search_prompt_updated", { directory_id: directoryId, prompt_set: !!next });
      if (webChanged) {
        recordEvent?.("directory_ai_search_web_toggled", { directory_id: directoryId, enabled: webEnabled });
      }
      setMsg("Saved.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change AI search settings.</p>;
  }

  return (
    <form onSubmit={savePrompt} style={{ display: "grid", gap: 10 }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
        Describe how the AI should interpret and prioritise search queries on the published site's search box — e.g. how
        to weigh location, which categories matter most, or how to handle vague queries. Leave blank to turn this off;
        the search box then stays on plain keyword matching, exactly as it does today.
      </p>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Search instructions</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          placeholder="e.g. Prioritise entries with a matching accreditation, and treat mentions of a UK town or postcode as a location filter."
          style={{ ...inputStyle, minHeight: 150, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={webEnabled}
          disabled={!prompt.trim()}
          onChange={(e) => setWebEnabled(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>Let Claude search the web for extra context (e.g. to interpret a place, term, or accreditation it doesn't recognise)</span>
      </label>
      {!prompt.trim() && <p style={{ fontSize: 12, opacity: 0.6, margin: "-4px 0 0 24px" }}>Save search instructions above first.</p>}

      <p style={{ margin: 0, fontSize: 12, opacity: 0.65, background: "var(--lc-bg-subtle, #f4f4f2)", padding: "8px 10px", borderRadius: 8 }}>
        Turning on AI search sends a visitor's search text to Anthropic (Claude's API) to interpret it. With web search
        enabled, related search queries may also be sent to look up outside context. Either way, only entries already in
        this directory can ever be shown as results — web results can inform the AI's reasoning but can never add a new
        entry that isn't already here.
      </p>

      <div>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
          {saving ? "Saving…" : "Save search settings"}
        </button>
      </div>
    </form>
  );
}
