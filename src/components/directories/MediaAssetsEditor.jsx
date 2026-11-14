import AIButton from "../ai/AIButton.jsx";
import AiProvenanceNote from "../ai/AiProvenanceNote.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../components/ai/AiUnavailableNotice.jsx";
import { deleteMediaAsset, generateMediaAltText, listMediaAssets, setHeroMediaAsset, uploadMediaAsset } from "../../lib/mediaAssets";
import { Button, Callout, Checkbox, EmptyState, Field, Pill, Skeleton, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

/**
 * Gallery/hero image list on an entry (build-scope §5.6). Picking a file no
 * longer uploads immediately — it shows a preview first, so "Generate with
 * AI" (Directory Searchability & AI Metadata plan, Feature 5) has an actual
 * image to describe before the alt text field is filled in and the upload
 * is confirmed. Alt text is still required before upload, same as before.
 */
export default function MediaAssetsEditor({ directoryId, entryId, recordEvent }) {
  const ai = useAiFeature("alt_text");
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [isHero, setIsHero] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!entryId) return;
    try {
      setLoading(true);
      setAssets(await listMediaAssets(entryId));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Revoke the local preview URL whenever it's replaced or the component unmounts.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function resetPending() {
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setAltText("");
    setCaption("");
    setCredit("");
    setIsHero(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAltText("");
  }

  async function handleGenerateAltText() {
    if (!pendingFile) return;
    setErr("");
    try {
      const suggested = await generateMediaAltText(entryId, pendingFile, isHero ? "hero" : "gallery");
      setAltText(suggested);
    } catch (e) {
      setErr(e?.message ?? String(e));
      return false;
    }
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setErr("");
    setUploading(true);
    try {
      const asset = await uploadMediaAsset(entryId, pendingFile, { altText, caption, credit, isHero });
      recordEvent?.("directory_entry_media_added", { directory_id: directoryId, entry_id: entryId, media_id: asset.id, is_hero: isHero });
      resetPending();
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setUploading(false);
    }
  }

  async function makeHero(asset) {
    try {
      await setHeroMediaAsset(entryId, asset.id);
      recordEvent?.("directory_entry_media_hero_set", { directory_id: directoryId, entry_id: entryId, media_id: asset.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function remove(asset) {
    try {
      await deleteMediaAsset(asset.id);
      recordEvent?.("directory_entry_media_removed", { directory_id: directoryId, entry_id: entryId, media_id: asset.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="b3-stack">
      <h3 className="b3-subhead">Media</h3>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      <div className="b3-form">
        <Field label="Image" hint="PNG, JPEG or WebP. You add alt text before it uploads.">
          <TextInput ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={uploading} />
        </Field>

        {pendingFile && (
          <>
            <div className="b3-media-pending">
              <img src={previewUrl} alt="" className="b3-media-preview" />
              <div className="b3-media-fields">
                <div className="b3-row b3-row--end">
                  <div className="b3-grow">
                    <Field label="Alt text" hint="Required before upload." required>
                      <TextInput value={altText} onChange={(e) => setAltText(e.target.value)} />
                    </Field>
                  </div>
                  <AIButton compact variant="subtle" label="Suggest" onGenerate={handleGenerateAltText} disabled={!ai.available} />
                </div>
                {!ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
                <AiProvenanceNote entityName="image" compact>AI looks at the image and suggests alt text. Check it before you upload.</AiProvenanceNote>
                <Field label="Caption" hint="Optional.">
                  <TextInput value={caption} onChange={(e) => setCaption(e.target.value)} />
                </Field>
                <Field label="Credit" hint="Optional.">
                  <TextInput value={credit} onChange={(e) => setCredit(e.target.value)} />
                </Field>
                <Checkbox label="Set as hero image" checked={isHero} onChange={(e) => setIsHero(e.target.checked)} />
              </div>
            </div>
            <div className="b3-form-actions">
              <Button variant="primary" onClick={handleUpload} loading={uploading} loadingLabel="Uploading…" disabled={!altText.trim()}>
                Upload
              </Button>
              <Button onClick={resetPending} disabled={uploading}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <Skeleton variant="tiles" label="Loading media" />
      ) : assets.length === 0 ? (
        <EmptyState art="none" title="No media uploaded yet" body="Choose an image above to add the first one." />
      ) : (
        <div className="b3-media-grid">
          {assets.map((a) => (
            <div key={a.id} className="b3-media-card">
              <img src={a.url} alt={a.alt_text} className="b3-media-img" />
              <div className="b3-media-body">
                {a.is_hero && <Pill tone="ok">Hero</Pill>}
                {a.caption && <div>{a.caption}</div>}
                <div className="b3-media-actions">
                  {!a.is_hero && (
                    <Button size="sm" onClick={() => makeHero(a)}>
                      Make hero
                    </Button>
                  )}
                  <Button variant="danger" size="sm" aria-label={`Delete image: ${a.alt_text || a.caption || "untitled"}`} onClick={() => remove(a)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
