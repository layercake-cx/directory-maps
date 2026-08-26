import React, { useCallback, useEffect, useState } from "react";
import { deleteMediaAsset, listMediaAssets, setHeroMediaAsset, uploadMediaAsset } from "../../lib/mediaAssets";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/** Gallery/hero image list on an entry (build-scope §5.6). Uploads immediately. */
export default function MediaAssetsEditor({ directoryId, entryId, recordEvent }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [isHero, setIsHero] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!altText.trim()) {
      setErr("Enter alt text before choosing a file.");
      e.target.value = "";
      return;
    }
    setErr("");
    setUploading(true);
    try {
      const asset = await uploadMediaAsset(entryId, file, { altText, caption, credit, isHero });
      recordEvent?.("directory_entry_media_added", { directory_id: directoryId, entry_id: entryId, media_id: asset.id, is_hero: isHero });
      setAltText("");
      setCaption("");
      setCredit("");
      setIsHero(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setUploading(false);
      e.target.value = "";
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
        <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Alt text (required before upload)" style={inputStyle} />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" style={inputStyle} />
        <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Credit (optional)" style={inputStyle} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <input type="checkbox" checked={isHero} onChange={(e) => setIsHero(e.target.checked)} />
          Set as hero image
        </label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={uploading} style={{ fontSize: 12 }} />
        {uploading && <span style={{ fontSize: 12, opacity: 0.7 }}>Uploading…</span>}
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
