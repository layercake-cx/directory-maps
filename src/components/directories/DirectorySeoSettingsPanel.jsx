import AIButton from "../ai/AIButton.jsx";
import AiProvenanceNote from "../ai/AiProvenanceNote.jsx";
import React, { useEffect, useId, useState } from "react";
import { Button, Callout, Checkbox, Field, Section, TextInput, Textarea, useConfirm } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";
import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../components/ai/AiUnavailableNotice.jsx";
import { updateDirectory, generateDirectorySeoMetadata } from "../../lib/directories.js";

function seoDefaultsFromDirectory(directory) {
  const s = directory?.seo_defaults_json && typeof directory.seo_defaults_json === "object" ? directory.seo_defaults_json : {};
  return {
    meta_title_template: s.meta_title_template || "",
    meta_description: s.meta_description || "",
    default_noindex: !!s.default_noindex,
    bing_site_auth_xml: s.bing_site_auth_xml || "",
  };
}

/**
 * Directory Settings › SEO — split out of DirectoryGeneralSettingsPanel.jsx for the admin shell
 * redesign's Settings › General vs. Settings › SEO nav split (Phase 2). Same fields, own save
 * call/button, own `msg`/`err` state — `updateDirectory()` already accepts a partial patch, so
 * this and DirectoryGeneralSettingsPanel.jsx save independently without conflicting.
 *
 * `name`, `home_nav_label`, and `seo_defaults_json.{meta_title_template,meta_description,default_noindex}`
 * already existed on `directories` (the latter unused until now — see
 * 20260827120000_directory_publish_foundation.sql); `seo_og_image_url` is new
 * (20260914210000). "Let search engines index this directory" is a single
 * combined switch (docs/DIRECTORIES.md §4.1) rather than separate
 * robots.txt/sitemap toggles: it drives robots.txt Allow/Disallow, whether
 * the landing page URL appears in sitemap.xml, and a blanket noindex meta
 * tag, all at once — see generate_directory_site/index.ts.
 */
export default function DirectorySeoSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const ai = useAiFeature("seo_metadata");
  const formId = useId();
  const confirm = useConfirm();
  const [seo, setSeo] = useState(() => seoDefaultsFromDirectory(directory));
  const [ogImageUrl, setOgImageUrl] = useState(directory?.seo_og_image_url || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setSeo(seoDefaultsFromDirectory(directory));
    setOgImageUrl(directory?.seo_og_image_url || "");
  }, [directory]);

  function setSeoField(key, value) {
    setSeo((s) => ({ ...s, [key]: value }));
    setMsg("");
  }

  async function handleGenerate() {
    if (seo.meta_title_template.trim() || seo.meta_description.trim()) {
      const ok = await confirm({
        title: "Overwrite the SEO title and description?",
        body: "This directory already has an SEO title or description set. Generating with AI will overwrite them here in the editor. Nothing is saved until you click Save settings.",
        confirmLabel: "Generate with AI",
      });
      if (!ok) return false;
    }
    setErr("");
    setMsg("");
    try {
      recordEvent?.("directory_ai_content_requested", { directory_id: directoryId, target: "directory_seo_metadata" });
      const draft = await generateDirectorySeoMetadata(directoryId);
      setSeo((s) => ({ ...s, meta_title_template: draft?.meta_title_template ?? s.meta_title_template, meta_description: draft?.meta_description ?? s.meta_description }));
      recordEvent?.("directory_ai_content_generated", { directory_id: directoryId, target: "directory_seo_metadata" });
    } catch (e2) {
      recordEvent?.("directory_ai_content_failed", { directory_id: directoryId, target: "directory_seo_metadata", error: e2?.message ?? String(e2) });
      setErr(e2?.message ?? String(e2));
      return false;
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const bingXml = seo.bing_site_auth_xml.trim();
      if (bingXml && (!/^(<\?xml[^>]*\?>\s*)?<users>[\s\S]*<\/users>$/i.test(bingXml) || bingXml.length > 2000)) {
        throw new Error("The Bing verification file should be the contents of BingSiteAuth.xml, starting with <?xml or <users> and ending with </users>.");
      }
      setSaving(true);
      const prevSeo = seoDefaultsFromDirectory(directory);
      const cleanOgImage = ogImageUrl.trim();
      const changedFields = [];
      if (seo.meta_title_template !== prevSeo.meta_title_template) changedFields.push("seo_defaults_json.meta_title_template");
      if (seo.meta_description !== prevSeo.meta_description) changedFields.push("seo_defaults_json.meta_description");
      if (seo.default_noindex !== prevSeo.default_noindex) changedFields.push("seo_defaults_json.default_noindex");
      if (seo.bing_site_auth_xml.trim() !== prevSeo.bing_site_auth_xml.trim()) changedFields.push("seo_defaults_json.bing_site_auth_xml");
      if (cleanOgImage !== (directory?.seo_og_image_url || "")) changedFields.push("seo_og_image_url");

      await updateDirectory(directoryId, {
        seo_defaults_json: {
          ...(directory?.seo_defaults_json && typeof directory.seo_defaults_json === "object" ? directory.seo_defaults_json : {}),
          meta_title_template: seo.meta_title_template.trim() || null,
          meta_description: seo.meta_description.trim() || null,
          default_noindex: seo.default_noindex,
          bing_site_auth_xml: bingXml || null,
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
    <Section
      title="SEO settings"
      description="Controls how this directory's public pages appear in search results and when shared on social media."
      actions={canManage ? <AIButton compact onGenerate={handleGenerate} disabled={!ai.available} /> : null}
      footer={canManage ? (
        <Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save settings</Button>
      ) : null}
    >
      {canManage && !ai.available ? <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} /> : null}
      {canManage ? (
        <AiProvenanceNote entityName="directory" compact>
          Drafts the title and description below from this directory&rsquo;s own entry count and categorisation, using a built-in drafting prompt. It lands here for review; nothing is saved until you click Save settings.
        </AiProvenanceNote>
      ) : null}

      <form id={formId} onSubmit={handleSave} className="b1-form">
        <Checkbox
          label="Let search engines index this directory"
          hint="Always excludes/includes this directory from its own sitemap.xml and adds/removes a “noindex” tag. Also updates its robots.txt — enforced by real search engines once this directory has its own custom domain (set up on the customer's Domains page); on the shared layercake domain, robots.txt is reachable for review but crawlers won't fetch a per-directory one there."
          checked={!seo.default_noindex}
          onChange={(e) => setSeoField("default_noindex", !e.target.checked)}
          disabled={disabled}
        />

        <Field label="Default SEO title">
          <TextInput
            value={seo.meta_title_template}
            onChange={(e) => setSeoField("meta_title_template", e.target.value)}
            disabled={disabled}
            placeholder="Defaults to the directory title"
          />
        </Field>

        <Field label="Default SEO description">
          <Textarea
            value={seo.meta_description}
            onChange={(e) => setSeoField("meta_description", e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Defaults to the directory description"
          />
        </Field>

        <Field label="Social/SEO image URL">
          <TextInput
            type="url"
            value={ogImageUrl}
            onChange={(e) => { setOgImageUrl(e.target.value); setMsg(""); }}
            disabled={disabled}
            placeholder="https://yourcompany.com/directory-cover.jpg"
          />
        </Field>

        <Field
          label="Bing verification file (BingSiteAuth.xml)"
          hint={<>Paste the contents of the XML file from Bing Webmaster Tools. After you Publish it is served at <code>/BingSiteAuth.xml</code> on this directory&apos;s custom domain (Bing only checks a domain&apos;s own root). Clear the box and publish to remove it.</>}
        >
          <Textarea
            className="mono"
            value={seo.bing_site_auth_xml}
            onChange={(e) => setSeoField("bing_site_auth_xml", e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder={'<?xml version="1.0"?>\n<users>\n\t<user>…</user>\n</users>'}
          />
        </Field>

        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}
      </form>
    </Section>
  );
}
