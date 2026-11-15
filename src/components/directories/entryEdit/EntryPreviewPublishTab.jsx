import React, { useEffect, useState } from "react";
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
import { Callout, Section, Skeleton } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";

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

  if (loading) return <Skeleton variant="form" rows={4} label="Loading preview" />;
  if (err) return <Callout tone="danger">{err}</Callout>;

  const previewImage = entry?.panel_image_url || entry?.logo_url || "";
  const previewBg = entry?.panel_background_color || themeSurfaceAlt;
  const entryUrl = directory?.published_at && clientSlug && directory?.slug && entry?.slug
    ? `https://maps.layercake-cx.biz/directories/${clientSlug}/${directory.slug}/${entry.slug}`
    : null;

  return (
    <div className="editor-stack">
      <Section
        title="Preview"
        description="Approximates how this entry appears live — not a byte-for-byte match, actual fonts/spacing/colours come from the directory's theme."
      >
        <div className="preview-split">
          <div>
            <h3 className="preview-caption">Homepage card</h3>
            <EntryCardPreview name={entry?.name} imageUrl={previewImage} backgroundColor={previewBg} />
          </div>
          <div className="preview-split-main">
            <h3 className="preview-caption">Entry page</h3>
            <div className="preview-frame">
              {(layout ?? []).map((block, i) => (
                <PreviewBlock key={`${blockKey(block)}-${i}`} block={block} entry={entry} extras={extras} />
              ))}
            </div>
          </div>
        </div>
        {entryUrl && (
          <a className="link-out" href={entryUrl} target="_blank" rel="noopener noreferrer">View live page →</a>
        )}
      </Section>

      <Section>
        <DirectoryPublishPanel
          directory={directory}
          clientSlug={clientSlug}
          canPublish={canEdit}
          recordEvent={recordEvent}
        />
        <p className="entries-muted">
          Publishing goes live for the whole directory, not just this entry — publishing just this entry was considered and turned out not to be worth building once a full republish came down to a few seconds.
        </p>
      </Section>
    </div>
  );
}
