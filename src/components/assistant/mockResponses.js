import { matchPath } from "react-router-dom";
import mock from "./assistant-mock.json";

/**
 * Canned content for the Ask Pip preview, from assistant-mock.json (a copy of
 * docs/design/discover-ui/assistant-mock.json). No network calls, no LLM: every reply is looked up here.
 */
export const MOCK = mock;

/** Strips the workspace prefix so route patterns like "directories/:directoryId/entries" match both portals. */
export function splitWorkspacePath(pathname) {
  const staff = pathname.match(/^\/admin\/clients\/([^/]+)(?:\/(.*))?$/);
  if (staff && staff[1] !== "new") return { base: `/admin/clients/${staff[1]}/`, rel: staff[2] || "", clientId: staff[1] };
  const client = pathname.match(/^\/client(?:\/(.*))?$/);
  if (client) return { base: "/client/", rel: client[1] || "", clientId: null };
  return { base: "/", rel: pathname.replace(/^\//, ""), clientId: null };
}

/** Finds the route group for a pathname and the params its pattern captured. Falls back to Home. */
export function resolveRouteGroup(pathname) {
  const { base, rel, clientId } = splitWorkspacePath(pathname);
  const relPath = `/${rel}`;
  for (const group of MOCK.routeGroups) {
    for (const pattern of group.match) {
      // Patterns starting with "/" are absolute (Home, platform); the rest are relative to the workspace.
      const m = pattern.startsWith("/")
        ? matchPath({ path: pattern, end: true }, pathname)
        : matchPath({ path: `/${pattern}`, end: true }, relPath);
      if (m) return { group, params: { ...m.params, ...(clientId ? { clientId } : {}) }, base, pageLabel: group.pageLabel };
    }
  }
  // Directory pages the mock doesn't list (content and AI pages): use the nearest group, with the real page name.
  const dir = rel.match(/^directories\/([^/]+)\/([^/]+)/);
  if (dir) {
    const label = EXTRA_PAGE_LABELS[dir[2]];
    const id = label ? "directory-entries" : "directory-overview";
    const group = MOCK.routeGroups.find((g) => g.id === id);
    return { group, params: { directoryId: dir[1], ...(clientId ? { clientId } : {}) }, base, pageLabel: label };
  }
  return { group: MOCK.routeGroups[0], params: clientId ? { clientId } : {}, base };
}

const EXTRA_PAGE_LABELS = {
  "ai-enrichment": "AI enrichment",
  pages: "Pages",
  categories: "Categories",
  accreditations: "Accreditations",
};

/** Fills ":directoryId" style params and prefixes the workspace base for relative links. */
export function resolveLink(to, params, base) {
  const filled = to.replace(/:([A-Za-z]+)/g, (_, key) => params[key] ?? `:${key}`);
  return filled.startsWith("/") ? filled : `${base}${filled}`;
}

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exact-text match of a typed question against this group's suggested prompts. */
export function findPromptByText(group, text) {
  const t = norm(text);
  return group.prompts.find((p) => norm(p.text) === t) || null;
}

export function randomThinkingLabel() {
  const labels = MOCK.thinkingLabels;
  return labels[Math.floor(Math.random() * labels.length)];
}
export const thinkingDelayMs = () => 900 + Math.floor(Math.random() * 500);
