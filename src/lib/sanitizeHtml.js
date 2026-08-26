import DOMPurify from "dompurify";

// Rich-text fields (directory_entries.notes_html, listings.notes_html) allow a
// small set of formatting/structure tags plus safe links and images — enough for
// "why included" / editorial copy, nothing that can execute script or navigate
// via javascript:/data: URIs.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "a", "img", "span", "div",
];
const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel"];

/**
 * Sanitises rich-text HTML before it's stored. Applied regardless of an
 * `allow_html`-style flag on the record — that flag only controls whether the
 * value is *rendered* as HTML or escaped to plain text; the stored value must
 * never contain live script either way.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeNotesHtml(html) {
  const input = String(html ?? "");
  if (!input) return input;
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}
