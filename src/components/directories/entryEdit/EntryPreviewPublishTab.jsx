import React, { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { getDirectory } from "../../../lib/directories.js";
import { supabase } from "../../../lib/supabase";
import { loadEntryTermIds } from "../../../lib/categorisations.js";
import { listEvidenceItems } from "../../../lib/evidenceItems.js";
import { listMediaAssets } from "../../../lib/mediaAssets.js";
import { listProductTiles } from "../../../lib/productTiles.js";
import { listProminentLinks } from "../../../lib/prominentLinks.js";
import { listAccreditationSchemes, loadEntryAccreditationSchemeIds } from "../../../lib/accreditations.js";
import { listEntryTemplates, resolveEntryLayout } from "../../../lib/entryTemplates.js";
import EntryCardPreview from "./EntryCardPreview.jsx";
import PreviewBlock from "../EntryPreviewBlock.jsx";
import DirectoryPublishPanel from "../DirectoryPublishPanel.jsx";

const DEFAULT_THEME_SURFACE_ALT = "#F1ECDF"; // matches generate_directory_site's NATURAL_DEFAULTS.surfaceAltColor

function blockKey(block) {
  return block.type === "categorisation" ? `categorisation:${block.key}` : block.type;
}

/**
 * Preview & Publish tab — a read-only approximation of this entry's
 * homepage card and detail page as they'd appear live, plus the directory's
 * own Publish action (single-entry publish was considered and deliberately
 * not built — see docs/DEPLOYMENTS.md's 2026-08-29 publish-perf entry: a
 * full republish is fast enough after parallelizing generate_directory_site
 * that the extra complexity of a targeted-publish path isn't worth it).
 */
export default function EntryPreviewPublishTab({ directoryId, entryId, entry, canEdit, recordEvent }) {
  const [directory, setDirectory] = useState(null);
  const [clientSlug, setClientSlug] = useState(null);
  const [layout, setLayout] = useState(null);
  const [extras, setExtras] = useState({});
  const [themeSurfaceAlt, setThemeSurfaceAlt] = useState(DEFAULT_THEME_SURFACE_ALT);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!directoryId || !entryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const dir = await getDirectory(directoryId);
        if (cancelled) return;
        setDirectory(dir);
        setThemeSurfaceAlt(dir?.theme_json?.surfaceAltColor || DEFAULT_THEME_SURFACE_ALT);

        const [{ data: client }, templates, termIds, evidence, media, tiles, links, heldSchemeIds, schemes] = await Promise.all([
          supabase.from("clients").select("slug").eq("id", dir.client_id).single(),
          listEntryTemplates(directoryId),
          loadEntryTermIds(entryId),
          listEvidenceItems(entryId),
          listMediaAssets(entryId),
          listProductTiles(entryId),
          listProminentLinks({ entryId }),
          loadEntryAccreditationSchemeIds(entryId),
          listAccreditationSchemes(directoryId),
        ]);
        if (cancelled) return;

        setClientSlug(client?.slug ?? null);
        setLayout(resolveEntryLayout(entry, templates, termIds));
        setExtras({
          evidence,
          media,
          tiles,
          links,
          accreditations: schemes.filter((s) => heldSchemeIds.includes(s.id)),
        });
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [directoryId, entryId, entry]);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#b91c1c" }}>{err}</p>;

  const previewImage = entry?.panel_image_url || entry?.logo_url || "";
  const previewBg = entry?.panel_background_color || themeSurfaceAlt;
  const entryUrl = directory?.published_at && clientSlug && directory?.slug && entry?.slug
    ? `https://maps.layercake-cx.biz/directories/${clientSlug}/${directory.slug}/${entry.slug}`
    : null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="admin-card" style={{ padding: 20 }}>
        <Text size="sm" fw={600} mb={4}>Preview</Text>
        <Text size="xs" c="dimmed" mb={14}>
          Approximates how this entry appears live — not a byte-for-byte match, actual fonts/spacing/colours come from the directory's theme.
        </Text>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <Text size="xs" fw={600} c="dimmed" mb={8}>Homepage card</Text>
            <EntryCardPreview name={entry?.name} imageUrl={previewImage} backgroundColor={previewBg} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <Text size="xs" fw={600} c="dimmed" mb={8}>Entry page</Text>
            <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, padding: 14, background: "#fff", maxHeight: 420, overflowY: "auto" }}>
              {(layout ?? []).map((block, i) => (
                <PreviewBlock key={`${blockKey(block)}-${i}`} block={block} entry={entry} extras={extras} />
              ))}
            </div>
          </div>
        </div>
        {entryUrl && (
          <Text size="xs" mt={12}>
            <a href={entryUrl} target="_blank" rel="noopener noreferrer">View live page →</a>
          </Text>
        )}
      </div>

      <div className="admin-card" style={{ padding: 20 }}>
        <DirectoryPublishPanel
          directory={directory}
          clientSlug={clientSlug}
          canPublish={canEdit}
          recordEvent={recordEvent}
        />
        <Text size="xs" c="dimmed" mt={10}>
          Publishing goes live for the whole directory, not just this entry — publishing just this entry was considered and turned out not to be worth building once a full republish came down to a few seconds.
        </Text>
      </div>
    </div>
  );
}
