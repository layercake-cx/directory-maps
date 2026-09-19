import React, { useCallback, useEffect, useRef, useState } from "react";
import { deleteMediaAsset, generateMediaAltText, listMediaAssets, setHeroMediaAsset, uploadMediaAsset } from "../../lib/mediaAssets";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/**
 * Gallery/hero image list on an entry (build-scope §5.6). Picking a file no
 * longer uploads immediately — it shows a preview first, so "Generate with
 * AI" (Directory Searchability & AI Metadata plan, Feature 5) has an actual
 * image to describe before the alt text field is filled in and the upload
 * is confirmed. Alt text is still required before upload, same as before.
 */
export default function MediaAssetsEditor({ directoryId, entryId, recordEvent }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [isHero, setIsHero] = useState(false);
  const [generating, setGenerating] = useState(false);
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
      setGenerating(true);
      const suggested = await generateMediaAltText(entryId, pendingFile, isHero ? "hero" : "gallery");
      setAltText(suggested);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setGenerating(false);
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
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Media</p>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      <div style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={uploading} style={{ fontSize: 12 }} />

        {pendingFile && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <img src={previewUrl} alt="" style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 6, border: "1px solid var(--lc-border)" }} />
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Alt text (required before upload)" style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" className="btn" style={{ fontSize: 11, padding: "5px 8px", whiteSpace: "nowrap" }} onClick={handleGenerateAltText} disabled={generating}>
                    {generating ? "Generating…" : "Generate with AI"}
                  </button>
                </div>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" style={inputStyle} />
                <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Credit (optional)" style={inputStyle} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input type="checkbox" checked={isHero} onChange={(e) => setIsHero(e.target.checked)} />
                  Set as hero image
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleUpload} disabled={uploading || !altText.trim()}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={resetPending} disabled={uploading}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : assets.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No media uploaded yet.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {assets.map((a) => (
            <div key={a.id} style={{ width: 120, border: "1px solid var(--lc-border)", borderRadius: 8, overflow: "hidden" }}>
              <img src={a.url} alt={a.alt_text} style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 6, fontSize: 11 }}>
                {a.is_hero && <div style={{ fontWeight: 600, color: "#0f9da8" }}>Hero</div>}
                {a.caption && <div style={{ opacity: 0.75 }}>{a.caption}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {!a.is_hero && (
                    <button type="button" className="btn" style={{ fontSize: 10, padding: "2px 5px" }} onClick={() => makeHero(a)}>
                      Make hero
                    </button>
                  )}
                  <button type="button" className="btn" style={{ fontSize: 10, padding: "2px 5px", color: "#b91c1c" }} onClick={() => remove(a)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
