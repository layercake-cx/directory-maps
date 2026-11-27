import { BLOCK_STYLE, isGenericBlock, renderGenericBlock } from "../../../supabase/functions/generate_directory_site/blocks.ts";

/**
 * The edit dialog's live preview. This is the SAME renderer the generator uses for the published page (blocks.ts is
 * plain string building, shared with the Edge Function), run in the browser on the block being edited, so what the
 * dialog shows is what the page will show. `themeCss` is the directory's theme taken from the canvas, so it looks like
 * the site. Data-bound blocks (an entry's gallery, contact panel and so on) need the entry's data and are not previewed
 * here; they show in the canvas.
 */
export function canPreviewBlock(type) {
  return isGenericBlock(type);
}

const WIDTH = { hero: 960, main: 680, sidebar: 360 };

export function renderBlockPreview({ type, region, pageKind, data, common, themeCss }) {
  if (!isGenericBlock(type)) return null;
  const rendered = renderGenericBlock(
    { id: "preview", region, position: 0, block_type: type, data: data ?? {}, common: common ?? {} },
    { pageKind, region, terms: [], entry: { id: "preview", name: "This listing", claimed: false } },
  );
  const inner = rendered?.html ?? '<p style="font:14px system-ui;color:#6b7280;margin:0">Nothing to show yet. Fill in the fields to see it.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss || BLOCK_STYLE}</style><style>html,body{margin:0}body{padding:16px;background:var(--bg,#fff)}</style></head><body><div style="max-width:${WIDTH[region] ?? 680}px;margin:0 auto">${inner}</div></body></html>`;
}
