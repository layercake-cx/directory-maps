/**
 * Checks for the SEO surface of the focused editor. Each check has a status shown as an icon AND text, so colour is never
 * the only signal: "ok", "warn" (worth a look) or "bad" (fix it). Pure functions: safe to call on every keystroke.
 */

export const TITLE_MAX = 60;
export const DESC_MAX = 160;
export const DESC_MIN = 70;

const PLACEHOLDER = /\[[^\]\n]{2,60}\]/;
export const hasPlaceholder = (s) => typeof s === "string" && PLACEHOLDER.test(s);

/** Counts blocks whose text still contains [bracketed] placeholder content (from the working copy). */
export function blocksWithPlaceholders(blocks) {
  const scan = (v) => {
    if (typeof v === "string") return PLACEHOLDER.test(v.replace(/<[^>]*>/g, " "));
    if (Array.isArray(v)) return v.some(scan);
    if (v && typeof v === "object") return Object.values(v).some(scan);
    return false;
  };
  return (blocks ?? []).filter((b) => !b.linked && scan(b.data)).length;
}

export function cut(text, max) {
  const s = (text ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** @returns {{ id: string, status: "ok"|"warn"|"bad", label: string, text: string }[]} */
export function seoChecks({ title, description, noindex, placeholderBlocks = 0 }) {
  const out = [];
  const t = (title ?? "").trim();
  const d = (description ?? "").trim();
  if (!t) out.push({ id: "title", status: "bad", label: "Title", text: "Missing. Add a meta title." });
  else if (t.length > TITLE_MAX) out.push({ id: "title", status: "warn", label: "Title", text: `${t.length} characters. Search results usually cut it off after ${TITLE_MAX}.` });
  else out.push({ id: "title", status: "ok", label: "Title", text: `${t.length} characters.` });

  if (!d) out.push({ id: "desc", status: "bad", label: "Description", text: "Missing. Add a meta description." });
  else if (d.length < DESC_MIN) out.push({ id: "desc", status: "warn", label: "Description", text: `Short at ${d.length} characters. Aim for ${DESC_MIN} to ${DESC_MAX}.` });
  else if (d.length > DESC_MAX) out.push({ id: "desc", status: "warn", label: "Description", text: `${d.length} characters. Search results usually cut it off after ${DESC_MAX}.` });
  else out.push({ id: "desc", status: "ok", label: "Description", text: `${d.length} characters.` });

  const inMeta = hasPlaceholder(t) || hasPlaceholder(d);
  if (inMeta) out.push({ id: "placeholders", status: "bad", label: "Placeholders", text: "The title or description still contains [bracketed] placeholder text." });
  else if (placeholderBlocks > 0) out.push({ id: "placeholders", status: "warn", label: "Placeholders", text: `${placeholderBlocks} block${placeholderBlocks === 1 ? "" : "s"} still contain [bracketed] placeholder text.` });
  else out.push({ id: "placeholders", status: "ok", label: "Placeholders", text: "None in the title, description or blocks." });

  if (noindex) out.push({ id: "index", status: "warn", label: "Indexing", text: "Set to noindex. Search engines will not list this page, and it is left out of the sitemap." });
  else out.push({ id: "index", status: "ok", label: "Indexing", text: "This page can appear in search results." });
  return out;
}
