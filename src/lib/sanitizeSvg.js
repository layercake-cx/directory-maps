import DOMPurify from "dompurify";

// Only allow same-document fragment refs (#id, used by <use>/gradients/clipPath) and
// embedded data: images. Strip any href pointing at an external resource.
const SAFE_HREF = /^(#|data:image\/)/i;

function stripExternalHrefs(node) {
  if (!node.hasAttribute) return;
  ["href", "xlink:href"].forEach((attr) => {
    if (node.hasAttribute(attr) && !SAFE_HREF.test(node.getAttribute(attr) || "")) {
      node.removeAttribute(attr);
    }
  });
}

/**
 * Sanitises raw SVG markup before it's stored/served as a custom pin icon.
 * Strips <script>, event-handler attributes, and external references (fetching a
 * remote resource embedded in an uploaded SVG is a stored-XSS/SSRF-adjacent risk even
 * though browsers don't execute scripts inside an SVG rendered via <img src>).
 * @param {string} svgText
 * @returns {string}
 */
export function sanitizeSvgMarkup(svgText) {
  DOMPurify.addHook("afterSanitizeAttributes", stripExternalHrefs);
  try {
    return DOMPurify.sanitize(svgText, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject"],
    });
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes", stripExternalHrefs);
  }
}

/**
 * Reads an uploaded SVG File, sanitises its markup, and returns a new File ready to upload.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function sanitizeSvgFile(file) {
  const text = await file.text();
  const clean = sanitizeSvgMarkup(text);
  return new File([clean], file.name, { type: "image/svg+xml" });
}
