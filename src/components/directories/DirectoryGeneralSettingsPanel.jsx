import React, { useEffect, useState } from "react";
import { Button } from "@mantine/core";
import { updateDirectory, generateDirectorySeoMetadata } from "../../lib/directories.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };
const sectionTitleStyle = { margin: "0 0 8px", fontSize: 13, fontWeight: 600 };

function seoDefaultsFromDirectory(directory) {
  const s = directory?.seo_defaults_json && typeof directory.seo_defaults_json === "object" ? directory.seo_defaults_json : {};
  return {
    meta_title_template: s.meta_title_template || "",
    meta_description: s.meta_description || "",
    default_noindex: !!s.default_noindex,
  };
}

/**
 * Directory Settings tab — "General settings" (title) + "SEO settings".
 * `name`, `home_nav_label`, and `seo_defaults_json.{meta_title_template,meta_description,default_noindex}`
 * already existed on `directories` (the latter unused until now — see
 * 20260827120000_directory_publish_foundation.sql); `seo_og_image_url` is new
 * (20260914210000). "Let search engines index this directory" is a single
 * combined switch (docs/DIRECTORIES.md §4.1) rather than separate
 * robots.txt/sitemap toggles: it drives robots.txt Allow/Disallow, whether
 * the landing page URL appears in sitemap.xml, and a blanket noindex meta
 * tag, all at once — see generate_directory_site/index.ts.
 */
export default function DirectoryGeneralSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [name, setName] = useState(directory?.name || "");
  const [homeNavLabel, setHomeNavLabel] = useState(directory?.home_nav_label || "");
  const [seo, setSeo] = useState(() => seoDefaultsFromDirectory(directory));
  const [ogImageUrl, setOgImageUrl] = useState(directory?.seo_og_image_url || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(directory?.name || "");
    setHomeNavLabel(directory?.home_nav_label || "");
    setSeo(seoDefaultsFromDirectory(directory));
    setOgImageUrl(directory?.seo_og_image_url || "");
  }, [directory]);

  function setSeoField(key, value) {
    setSeo((s) => ({ ...s, [key]: value }));
    setMsg("");
  }

  async function handleGenerate() {
    if ((seo.meta_title_template.trim() || seo.meta_description.trim()) && !window.confirm("This directory already has an SEO title or description set — generating with AI will overwrite them here in the editor (nothing is saved until you click Save settings). Continue?")) {
      return;
    }
    setErr("");
    setMsg("");
    try {
      setGenerating(true);
      recordEvent?.("directory_ai_content_requested", { directory_id: directoryId, target: "directory_seo_metadata" });
      const draft = await generateDirectorySeoMetadata(directoryId);
      setSeo((s) => ({ ...s, meta_title_template: draft?.meta_title_template ?? s.meta_title_template, meta_description: draft?.meta_description ?? s.meta_description }));
      recordEvent?.("directory_ai_content_generated", { directory_id: directoryId, target: "directory_seo_metadata" });
    } catch (e2) {
      recordEvent?.("directory_ai_content_failed", { directory_id: directoryId, target: "directory_seo_metadata", error: e2?.message ?? String(e2) });
      setErr(e2?.message ?? String(e2));
    } finally {
      setGenerating(false);
    }
  }

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
      const prevSeo = seoDefaultsFromDirectory(directory);
      const cleanOgImage = ogImageUrl.trim();
      const changedFields = [];
      const cleanHomeNav = homeNavLabel.trim();
      if (cleanName !== (directory?.name || "")) changedFields.push("name");
      if (cleanHomeNav !== (directory?.home_nav_label || "")) changedFields.push("home_nav_label");
      if (seo.meta_title_template !== prevSeo.meta_title_template) changedFields.push("seo_defaults_json.meta_title_template");
      if (seo.meta_description !== prevSeo.meta_description) changedFields.push("seo_defaults_json.meta_description");
      if (seo.default_noindex !== prevSeo.default_noindex) changedFields.push("seo_defaults_json.default_noindex");
      if (cleanOgImage !== (directory?.seo_og_image_url || "")) changedFields.push("seo_og_image_url");

      await updateDirectory(directoryId, {
        name: cleanName,
        home_nav_label: cleanHomeNav || null,
        seo_defaults_json: {
          ...(directory?.seo_defaults_json && typeof directory.seo_defaults_json === "object" ? directory.seo_defaults_json : {}),
          meta_title_template: seo.meta_title_template.trim() || null,
          meta_description: seo.meta_description.trim() || null,
          default_noindex: seo.default_noindex,
        },
        seo_og_image_url: cleanOgImage || null,
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

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <p style={{ ...sectionTitleStyle, marginBottom: 4 }}>SEO settings</p>
          {canManage && (
            <Button size="xs" variant="light" onClick={handleGenerate} loading={generating}>Generate with AI</Button>
          )}
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12, opacity: 0.65 }}>
          Controls how this directory's public pages appear in search results and when shared on social media. "Generate with AI" drafts the title and description below from this directory's own entry count and categorisation — lands here for review, nothing is saved until you click Save settings.
        </p>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 6, cursor: disabled ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={!seo.default_noindex}
            onChange={(e) => setSeoField("default_noindex", !e.target.checked)}
            disabled={disabled}
          />
          Let search engines index this directory
        </label>
        <p style={{ margin: "0 0 14px", fontSize: 11.5, opacity: 0.6 }}>
          Always excludes/includes this directory from its own sitemap.xml and adds/removes a "noindex" tag. Also updates its robots.txt — enforced by real search engines once this directory has its own custom domain (set up on the customer's Domains page); on the shared layercake domain, robots.txt is reachable for review but crawlers won't fetch a per-directory one there.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Default SEO title</label>
          <input
            value={seo.meta_title_template}
            onChange={(e) => setSeoField("meta_title_template", e.target.value)}
            disabled={disabled}
            placeholder="Defaults to the directory title"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Default SEO description</label>
          <textarea
            value={seo.meta_description}
            onChange={(e) => setSeoField("meta_description", e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Defaults to the directory description"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Social/SEO image URL</label>
          <input
            type="url"
            value={ogImageUrl}
            onChange={(e) => { setOgImageUrl(e.target.value); setMsg(""); }}
            disabled={disabled}
            placeholder="https://yourcompany.com/directory-cover.jpg"
            style={inputStyle}
          />
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
